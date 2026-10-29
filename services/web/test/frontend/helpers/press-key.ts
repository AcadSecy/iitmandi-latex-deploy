// These component tests run in Chrome. Include the virtual key code and text so
// Chromium performs native button activation, rather than only firing key events.
export function pressKey(key: 'Enter' | 'Escape' | 'Space') {
  const keys = {
    Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
    Escape: { key: 'Escape', code: 'Escape', keyCode: 27, text: '' },
    Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  }
  const { keyCode, ...event } = keys[key]
  const params = { ...event, windowsVirtualKeyCode: keyCode }

  return cy
    .then(() =>
      Cypress.automation('remote:debugger:protocol', {
        command: 'Input.dispatchKeyEvent',
        params: { ...params, type: 'keyDown' },
      })
    )
    .then(() =>
      Cypress.automation('remote:debugger:protocol', {
        command: 'Input.dispatchKeyEvent',
        params: { ...params, text: '', type: 'keyUp' },
      })
    )
}
