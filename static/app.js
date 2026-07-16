async function performSearch() {
    const snomed = document.getElementById('snomedInput').value;
    const response = await fetch('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snomed_code: snomed, latitude: 53.7945, longitude: -1.5977 })
    });
    const data = await response.json();
    document.getElementById('searchResults').innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
}

async function checkExpirations() {
    // This will connect to your AI services or backend expiry logic
    document.getElementById('expiryResults').innerText = "Scanning network for stock expiring < 30 days...";
}