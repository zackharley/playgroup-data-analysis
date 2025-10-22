// Helper function to parse time string "MM:SS" to seconds
function parseTimeToSeconds(timeStr) {
  if (!timeStr || timeStr === '00:00:00') return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  // MM:SS
  return parts[0] * 60 + parts[1];
}

// Extract Chartkick chart data from HTML content
function extractChartData(htmlContent, chartId) {
  try {
    // Match: new Chartkick["ChartType"]("chart-N", DATA, {...})
    const regex = new RegExp(
      `new Chartkick\\["\\w+"\\]\\("${chartId}", (\\[.+?\\]), \\{`,
      's'
    );
    const match = htmlContent.match(regex);
    if (match && match[1]) {
      // Parse the JSON data array
      return JSON.parse(match[1]);
    }
    return null;
  } catch (error) {
    console.error(`Error extracting chart data for ${chartId}:`, error.message);
    return null;
  }
}

// Extract damage matrix from a table
async function extractDamageMatrix(page, tableSelector) {
  return await page.evaluate((selector) => {
    const table = document.querySelector(selector);
    if (!table) return null;

    const rows = Array.from(table.querySelectorAll('tr'));
    // Skip header row
    const dataRows = rows.slice(1);

    return dataRows.map((row) => {
      const cells = Array.from(row.querySelectorAll('td'));
      return cells.map((cell) => {
        const text = cell.textContent.trim();
        // Handle opacity-50 spans (zeros)
        if (cell.querySelector('span.opacity-50')) return 0;
        const num = Number(text);
        return isNaN(num) ? 0 : num;
      });
    });
  }, tableSelector);
}

module.exports = {
  parseTimeToSeconds,
  extractChartData,
  extractDamageMatrix,
};
