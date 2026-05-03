const slugify = require('slugify');

/**
 * Resolve the correct price per unit from a product's price tiers.
 * @param {Array} priceTiers - Sorted ascending by minQty
 * @param {number} basePrice - Fallback price
 * @param {number} quantity - Quantity being ordered
 * @returns {number} Price per unit in paisa
 */
function resolvePriceTier(priceTiers, basePrice, quantity) {
  if (!priceTiers || priceTiers.length === 0) return basePrice;

  // Find the tier that matches the quantity (tiers sorted ascending by minQty)
  let resolved = basePrice;
  for (const tier of priceTiers) {
    if (quantity >= tier.minQty && (tier.maxQty === null || quantity <= tier.maxQty)) {
      resolved = tier.pricePerUnit;
      break;
    }
  }
  return resolved;
}

/**
 * Generate a URL-friendly slug from a string, with uniqueness suffix if needed.
 */
function generateSlug(text) {
  return slugify(text, { lower: true, strict: true, trim: true });
}

/**
 * Convert paisa to rupees for display.
 */
function paisaToRupees(paisa) {
  return (paisa / 100).toFixed(2);
}

/**
 * Format amount in words (Indian number system).
 * Simple implementation — handles up to ₹99,99,99,999.
 */
function amountInWords(paisa) {
  const rupees = Math.floor(paisa / 100);
  const paise = paisa % 100;

  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function twoDigits(n) {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  }

  function threeDigits(n) {
    if (n === 0) return '';
    const h = Math.floor(n / 100);
    const rest = n % 100;
    let str = '';
    if (h > 0) str += ones[h] + ' Hundred';
    if (rest > 0) str += (h > 0 ? ' and ' : '') + twoDigits(rest);
    return str;
  }

  // Indian system: ones, thousands, lakhs, crores
  let words = '';
  const crores = Math.floor(rupees / 10000000);
  const lakhs = Math.floor((rupees % 10000000) / 100000);
  const thousands = Math.floor((rupees % 100000) / 1000);
  const hundreds = rupees % 1000;

  if (crores > 0) words += twoDigits(crores) + ' Crore ';
  if (lakhs > 0) words += twoDigits(lakhs) + ' Lakh ';
  if (thousands > 0) words += twoDigits(thousands) + ' Thousand ';
  if (hundreds > 0) words += threeDigits(hundreds);

  words = words.trim();
  let result = words + ' Rupees';
  if (paise > 0) result += ' and ' + twoDigits(paise) + ' Paise';
  result += ' Only';

  return result;
}

/**
 * Get the current Indian financial year string.
 * FY runs April 1 to March 31.
 * @param {Date} date
 * @returns {string} e.g., "2025-26"
 */
function getFinancialYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  if (month >= 3) {
    // April onwards: current year - next year
    return `${year}-${String(year + 1).slice(2)}`;
  }
  // Jan-March: previous year - current year
  return `${year - 1}-${String(year).slice(2)}`;
}

module.exports = {
  resolvePriceTier,
  generateSlug,
  paisaToRupees,
  amountInWords,
  getFinancialYear,
};
