export default async function handler(req, res) {
  const token = process.env.HUBSPOT_TOKEN;

  const response = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filterGroups: [{
        filters: [{ propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' }]
      }],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      properties: ['dealname', 'amount', 'hs_lastmodifieddate'],
      limit: 10
    })
  });

  const data = await response.json();
  res.status(200).json(data);
}
