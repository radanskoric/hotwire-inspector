import path from 'path';

export const fixturesRoot = path.resolve('tests/e2e/fixtures');
export const fixtureUrl = (origin) => `${origin}/test-page.html`;
export const deepFixtureUrl = (origin) => `${origin}/deep-page.html`;
