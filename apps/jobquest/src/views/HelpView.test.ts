import { screen, within } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '../navigation';
import { installFakeApi } from '../test/fakeApi';
import { renderApp } from '../test/renderApp';

describe('Help', () => {
  it('covers every page in the sidebar, by the name the sidebar uses', async () => {
    installFakeApi();
    const { router } = await renderApp('/help');
    await screen.findByRole('heading', { level: 1, name: 'Help' });

    for (const item of NAV_ITEMS.filter((navItem) => navItem.name !== 'help')) {
      const links = screen.getAllByRole('link', { name: `Go to ${item.label}` });
      expect(links[0], item.label).toHaveAttribute(
        'href',
        router.resolve({ name: item.name }).href
      );
    }
  });

  it('lists its sections, and a contents link moves focus to the section', async () => {
    installFakeApi();
    const { router, user } = await renderApp('/help');
    const contents = await screen.findByRole('navigation', { name: 'Contents' });
    const links = within(contents).getAllByRole('link');

    for (const link of links) {
      const id = link.getAttribute('href')?.split('#')[1] ?? '';
      expect(screen.getByRole('region', { name: link.textContent?.trim() })).toHaveAttribute(
        'id',
        id
      );
    }

    await user.click(within(contents).getByRole('link', { name: 'Step 3: Spot trends' }));

    expect(router.currentRoute.value.fullPath).toBe('/help#trends');
    expect(screen.getByRole('region', { name: 'Step 3: Spot trends' })).toHaveFocus();
  });
});
