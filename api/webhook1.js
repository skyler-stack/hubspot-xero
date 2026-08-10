export default function handler(req, res) {
  console.log('收到HubSpot消息:', JSON.stringify(req.body, null, 2));
  res.status(200).json({ received: true });
}
