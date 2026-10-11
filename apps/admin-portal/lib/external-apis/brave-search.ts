const API_KEY = process.env.BRAVE_SEARCH_API;

type BraveWebResult = {
  url: string;
  title: string;
  description: string;
};

type BraveSearchResponse = {
  web?: {
    results?: BraveWebResult[];
  };
};

export async function searchCompany(
  companyName: string
): Promise<{ website?: string; description?: string }> {
  if (!API_KEY) return {};

  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(`${companyName} Australia`)}&count=3`,
    {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': API_KEY,
      },
    }
  );

  if (!res.ok) return {};
  const data: BraveSearchResponse = await res.json();

  const results = data.web?.results;
  if (!results?.length) return {};

  // Find the most likely company website (first result that isn't a directory/social site)
  const skipDomains = [
    'linkedin.com',
    'facebook.com',
    'twitter.com',
    'instagram.com',
    'yellowpages.com.au',
    'truelocal.com.au',
    'yelp.com',
    'wikipedia.org',
  ];

  const companyResult = results.find((r) => !skipDomains.some((d) => r.url.includes(d)));

  return {
    website: companyResult?.url,
    description: (companyResult || results[0])?.description,
  };
}
