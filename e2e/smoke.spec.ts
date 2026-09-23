import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * End-to-end smoke test against the local Supabase stack (`supabase start`).
 *
 * This is the layer that exercises what unit tests cannot: real auth, real rows,
 * and the RLS policies that decide whether the app can read back what it wrote.
 */

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`
}

const PASSWORD = 'test-password-123'

async function signUpAndIn(page: Page, email: string) {
  await page.goto('/')

  await page.getByRole('button', { name: 'Sign up' }).click()
  await page.getByPlaceholder('Your name').fill('E2E Tester')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  // With email confirmation off (local default) signup signs the user straight in.
  // With it on (production) the form returns to sign-in mode first. Handle both.
  const onboardingSkip = page.getByRole('button', { name: 'Skip' })
  const confirmation = page.getByText('Account created!')
  await expect(onboardingSkip.or(confirmation).first()).toBeVisible({ timeout: 15_000 })

  if (await confirmation.isVisible()) {
    await page.getByPlaceholder('Email').fill(email)
    await page.getByPlaceholder('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
  }

  // First-time users land on onboarding.
  await onboardingSkip.click()
}

/** Waits for a Supabase REST write to the given table to come back. */
function waitForWrite(page: Page, table: string) {
  return page.waitForResponse(
    (r) => r.url().includes(`/rest/v1/${table}`) && r.request().method() === 'POST' && r.ok(),
    { timeout: 15_000 },
  )
}

async function addSong(page: Page, title: string, lyrics: string) {
  await page.getByRole('button', { name: 'Add song' }).click()
  await page.getByPlaceholder('e.g. Ave Verum Corpus').fill(title)
  await page.getByPlaceholder(/Ave verum corpus natum/).fill(lyrics)

  // The app writes songs → then library + cards, without blocking the UI.
  // Wait for those writes rather than racing them with the next navigation.
  const libraryWrite = waitForWrite(page, 'user_song_library')
  const cardsWrite = waitForWrite(page, 'cards')
  await page.getByRole('button', { name: 'Save song' }).click()
  await Promise.all([libraryWrite, cardsWrite])
}

test('a new user can sign up, add a song, and see it persist', async ({ page }) => {
  const email = uniqueEmail()
  const title = `Test Song ${Date.now()}`

  await signUpAndIn(page, email)

  // Fresh account starts with an empty library (the Songs tab, not the Today tab).
  await page.getByRole('button', { name: 'Songs', exact: true }).click()
  await expect(page.getByText('No songs yet')).toBeVisible()

  await addSong(page, title, 'Ave verum corpus natum\nDe Maria Virgine\nVere passum immolatum')

  // Saving navigates to the song's stats page.
  await expect(page.getByRole('heading', { name: title })).toBeVisible()

  // The real assertion: reload so all state comes back from Postgres through RLS,
  // not from React state left over from the write. (Reload lands on the Today tab.)
  await page.reload()
  await page.getByRole('button', { name: 'Songs', exact: true }).click()
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 })
})

test('studying a line persists its SM-2 progress', async ({ page }) => {
  const email = uniqueEmail()
  const title = `Study Song ${Date.now()}`

  await signUpAndIn(page, email)
  await addSong(page, title, 'First line of the song\nSecond line of the song')

  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  // Both lines start unstudied.
  await expect(page.getByText('Never studied')).toHaveCount(2)

  // Pick the fill-in-the-blanks exercise from the practice picker.
  await page.getByRole('button', { name: /Fill-in-the-blanks with spaced repetition/ }).click()

  // Answer the blanks (a wrong answer still grades the card — we care that the
  // review is written, not that it was correct).
  const inputs = page.getByRole('textbox')
  const count = await inputs.count()
  for (let i = 0; i < count; i++) await inputs.nth(i).fill('x')

  // Grading the card upserts its SM-2 state; wait for that write to land.
  const reviewWrite = waitForWrite(page, 'cards')
  await page.getByRole('button', { name: 'Check' }).click()
  await page.getByRole('button', { name: 'Next line' }).click()
  await reviewWrite

  // Reload so everything is re-read from Postgres, then reopen the song.
  await page.reload()
  await page.getByRole('button', { name: 'Songs', exact: true }).click()
  await page.getByText(title).click()

  // Exactly one line should now have a review recorded.
  await expect(page.getByText('Never studied')).toHaveCount(1, { timeout: 15_000 })
})
