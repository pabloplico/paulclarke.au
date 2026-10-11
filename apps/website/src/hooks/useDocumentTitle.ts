import { useEffect } from 'react';

const SITE_NAME = 'Paul Clarke';

/** Sets the tab title for the current page: "Projects | Paul Clarke", or the site title for home. */
export function useDocumentTitle(pageTitle: string | null) {
  useEffect(() => {
    document.title = pageTitle
      ? `${pageTitle} | ${SITE_NAME}`
      : `${SITE_NAME} | Frontend developer, Brisbane`;
  }, [pageTitle]);
}
