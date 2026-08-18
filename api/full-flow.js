export default async function handler(req, res) {
  // ===== 第一步:查HubSpot最新的Closed Won deal =====
  const hubspotToken = process.env.HUBSPOT_TOKEN;

  const dealResponse = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${hubspotToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filterGroups: [{
        filters: [{ propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' }]
      }],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      properties: ['dealname', 'amount'],
      limit: 1
    })
  });

  const dealData = await dealResponse.json();
  const deal = dealData.results?.[0];

  if (!deal) {
    return res.status(404).json({ step: 'hubspot', error: 'No Closed Won deal found' });
  }

  const dealName = deal.properties.dealname || 'Unnamed Deal';
  const dealAmount = parseFloat(deal.properties.amount) || 0;

  // ===== 第二步:Xero拿access token =====
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;

  // 从Global Config读取最新的refresh_token(不再用写死的环境变量)
  const savedTokenResponse = await fetch(`${process.env.EDGE_CONFIG}`).catch(() => null);
  let refreshToken = process.env.XERO_REFRESH_TOKEN; // 兜底,第一次用时还没存过

  try {
    const configUrl = process.env.EDGE_CONFIG;
    const getRes = await fetch(`https://edge-config.vercel.com/v1/config/get?key=xero_refresh_token`, {
      headers: { 'Authorization': `Bearer ${process.env.VERCEL_API_TOKEN}` }
    });
  } catch (e) {}

  const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  const newRefreshToken = tokenData.refresh_token;

  if (!accessToken) {
    return res.status(500).json({ step: 'xero_auth', error: 'Failed to get Xero access token', details: tokenData });
  }

  const connectionsResponse = await fetch('https://api.xero.com/connections', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const connections = await connectionsResponse.json();
  const tenantId = connections[0]?.tenantId;

  if (!tenantId) {
    return res.status(500).json({ step: 'xero_tenant', error: 'No Xero organisation connected' });
  }

  // ===== 第三步:Xero建发票 =====
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateString = dueDate.toISOString().split('T')[0];

  const invoiceResponse = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      Type: 'ACCREC',
      Contact: { Name: dealName },
      LineItems: [{
        Description: `Invoice for deal: ${dealName}`,
        Quantity: 1,
        UnitAmount: dealAmount,
        AccountCode: '200'
      }],
      DueDate: dueDateString,
      Status: 'AUTHORISED'
    })
  });

  const invoiceData = await invoiceResponse.json();
  const invoice = invoiceData.Invoices?.[0];

  if (!invoice) {
    return res.status(500).json({ step: 'xero_invoice', error: 'Failed to create invoice', details: invoiceData });
  }

  // ===== 第四步:GoCardless建付款请求 =====
  const gcToken = process.env.GOCARDLESS_TOKEN;
  const amountInPence = Math.round(dealAmount * 100);

  const billingRequestResponse = await fetch('https://api-sandbox.gocardless.com/billing_requests', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${gcToken}`,
      'Content-Type': 'application/json',
      'GoCardless-Version': '2015-07-06'
    },
    body: JSON.stringify({
      billing_requests: {
        payment_request: {
          description: `Payment for ${dealName}`,
          amount: amountInPence,
          currency: 'GBP'
        }
      }
    })
  });

  const billingRequestData = await billingRequestResponse.json();
  const billingRequestId = billingRequestData.billing_requests?.id;

  if (!billingRequestId) {
    return res.status(500).json({ step: 'gocardless_request', error: 'Failed to create billing request', details: billingRequestData });
  }

  const flowResponse = await fetch('https://api-sandbox.gocardless.com/billing_request_flows', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${gcToken}`,
      'Content-Type': 'application/json',
      'GoCardless-Version': '2015-07-06'
    },
    body: JSON.stringify({
      billing_request_flows: {
        redirect_uri: 'https://hubspot-xero.vercel.app',
        links: { billing_request: billingRequestId }
      }
    })
  });

  const flowData = await flowResponse.json();

  // ===== 最终结果汇总 =====
  res.status(200).json({
    deal: { name: dealName, amount: dealAmount },
    invoice: { number: invoice.InvoiceNumber, id: invoice.InvoiceID, total: invoice.Total },
    payment: { authorisationUrl: flowData.billing_request_flows?.authorisation_url }
  });
}
