const fs = require('fs');

async function test() {
  for (const port of [8000, 8001]) {
    try {
      console.log('Trying port', port);
      const res = await fetch(`http://localhost:${port}/api/v2/intelligence/hub`);
      if (res.ok) {
        console.log('Success on port', port);
        const hub = await res.json();
        const fRes = await fetch(`http://localhost:${port}/api/v1/forecast?periods=3`);
        const pRes = await fetch(`http://localhost:${port}/api/v1/personas`);
        const forecast = await fRes.json();
        const personas = await pRes.json();
        
        fs.writeFileSync('api_response.json', JSON.stringify({ hub, forecast, personas }, null, 2));
        console.log('Data saved to api_response.json');
        break;
      }
    } catch(e) {
      console.log('Failed port', port);
    }
  }
}
test();
