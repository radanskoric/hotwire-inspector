import path from 'path';

export const fixturesRoot = path.resolve('tests/e2e/fixtures');
export const fixtureUrl = (origin) => `${origin}/test-page.html`;
export const deepFixtureUrl = (origin) => `${origin}/deep-page.html`;
export const stimulusAppFixtureUrl = (origin) => `${origin}/stimulus-app-page.html`;
export const StimulusAppFixtureUrl = (origin) => `${origin}/StimulusApp-page.html`;
