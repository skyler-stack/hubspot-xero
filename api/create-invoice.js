export default async function handler(req, res) {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const refreshToken = process.env.XERO_REFRESH_TOKEN;

  // 第一步:用refresh_token换新的access_token
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
    return res.status(500).json({ error: 'Failed to get access token', details: tokenData });
  }

  // 第二步:拿到Xero的tenant id(哪个公司账套)
  const connectionsResponse = await fetch('https://api.xero.com/connections', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  const connections = await connectionsResponse.json();
  const tenantId = connections[0]?.tenantId;

  if (!tenantId) {
    return res.status(500).json({ error: 'No Xero organisation connected', details: connections });
  }

  // 第三步:创建一张测试发票(先用固定的测试数据,之后接入真实HubSpot deal数据)
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
        Name: 'Test Customer'
      },
      LineItems: [
        {
          Description: 'Test Invoice from HubSpot deal',
          Quantity: 1,
          UnitAmount: 100,
          AccountCode: '200'
        }
      ],
      Status: 'AUTHORISED'
    })
  });

  const invoiceData = await invoiceResponse.json();
  res.status(200).json(invoiceData);
}
