/**
 * Utility functions for the BookLore recommendations system
 */

/**
 * Generate Amazon search URL for a book
 * @param title Book title
 * @param author Book author
 * @returns Amazon search URL
 */
export function getAmazonSearchUrl(title: string, author: string): string {
  const query = encodeURIComponent(`${title} ${author}`);
  return `https://www.amazon.com/s?k=${query}`;
}

/**
 * Generate Amazon affiliate link (requires Amazon Associates account)
 * @param title Book title
 * @param author Book author
 * @param affiliateTag Amazon affiliate tag (optional)
 * @returns Amazon affiliate search URL
 */
export function getAmazonAffiliateLink(
  title: string,
  author: string,
  affiliateTag?: string
): string {
  const query = encodeURIComponent(`${title} ${author}`);
  const tag = affiliateTag || process.env.AMAZON_AFFILIATE_TAG;

  if (tag) {
    return `https://www.amazon.com/s?k=${query}&tag=${tag}`;
  }

  // Fall back to regular search if no affiliate tag
  return getAmazonSearchUrl(title, author);
}
