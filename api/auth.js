export default function handler(req, res) {
  const clientId = process.env.XERO_CLIENT_ID;
  const redirectUri = 'https://hubspot-xero.vercel.app/api/callback';
  const scope = 'offline_access accounting.contacts accounting.invoices';

  const authUrl = `https://login.xero.com/identity/connect/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;

  res.redirect(authUrl);
}
