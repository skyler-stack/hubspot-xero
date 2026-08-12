export default async function handler(req, res) {
  const gcToken = process.env.GOCARDLESS_TOKEN;

  // 创建一个Billing Request(付款/mandate授权请求)
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
          description: 'Invoice payment',
          amount: 100000, // 单位是便士,100000 = £1000.00
          currency: 'GBP'
        }
      }
    })
  });

  const billingRequestData = await billingRequestResponse.json();
  const billingRequestId = billingRequestData.billing_requests?.id;

  if (!billingRequestId) {
    return res.status(500).json({ error: 'Failed to create billing request', details: billingRequestData });
  }

  // 创建一个授权流程(Billing Request Flow),生成客户要点击的链接
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
        links: {
          billing_request: billingRequestId
        }
      }
    })
  });

  const flowData = await flowResponse.json();
  res.status(200).json(flowData);
}
