export default async function handler(req, res) {
  // ===== 第一步:查HubSpot,拿到最新的Closed Won deal =====
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
    return res.status(404).json({ error: 'No Closed Won deal found in HubSpot' });
  }

  const dealName = deal.properties.dealname || 'Unnamed Deal';
  const dealAmount = parseFloat(deal.properties.amount) || 0;

  // ===== 第二步:用refresh_token换Xero的access_token =====
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const refreshToken = process.env.XERO_REFRESH_TOKEN;

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

  if (!accessToken) {
    return res.status(500).json({ error: 'Failed to get Xero access token', details: tokenData });
  }

  // ===== 第三步:拿tenant id =====
  const connectionsResponse = await fetch('https://api.xero.com/connections', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const connections = await connectionsResponse.json();
  const tenantId = connections[0]?.tenantId;

  if (!tenantId) {
    return res.status(500).json({ error: 'No Xero organisation connected', details: connections });
  }

  // ===== 第四步:用deal的真实数据建发票 =====
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
      Contact: {
        Name: dealName
      },
      LineItems: [
        {
          Description: `Invoice for deal: ${dealName}`,
          Quantity: 1,
          UnitAmount: dealAmount,
          AccountCode: '200'
        }
      ],
      DueDate: dueDateString,
      Status: 'AUTHORISED'
    })
  });

  const invoiceData = await invoiceResponse.json();
  res.status(200).json({ dealUsed: { name: dealName, amount: dealAmount }, invoiceResult: invoiceData });
}
