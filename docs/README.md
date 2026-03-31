# Documentation

[English](./README.md) | [Русский](./ru/README_ru.md)

## Mangabuff-helper

`Mangabuff-helper` is a Tampermonkey userscript for `mangabuff.ru` that combines quiz automation, reader automation, mine automation, a built-in chat drawer, and local toast notifications in one control panel.

## Version

Current userscript version: `2.1.0`

## Files

- `../mangabuff_helper.js` is the only working userscript in the repository.
- `../mangabuff_autoquiz.js` is a legacy compatibility stub. The real logic was merged into `mangabuff_helper.js`.

## Reader Modules

- `AutoScroll`
  Scrolls the chapter page with configurable strength and interval.
- `Auto Chapter`
  Switches to the next chapter when the bottom of the page is reached.
- `Auto Likes`
  Sends one `/favourite` request for each new chapter and shows a toast notification.
- `Auto Comments`
  Sends one short comment every `N` chapters and shows a toast notification.

## Behavior

- When auto-scroll switches to the next chapter, the script preserves the scroll state and retries startup on the new page until the reader markup becomes available.
- Successful quiz answers are logged to the browser console.
- Like and comment events are shown as local popup notifications.
- The script does not run inside embedded iframes, so the built-in chat drawer does not recursively load new helper instances.

## Other Modules

- `AutoQuiz`
  Starts the quiz flow, reads `correct_text` from the API response, and keeps answering while the quiz is active.
- `AutoMine`
  Sends `POST /mine/hit` through XHR. If the endpoint returns `403`, the script falls back to the visible mine button when possible.
- `Built-in Chat`
  Opens a right-side drawer with an embedded chat page loaded in an `iframe`.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Create a new userscript.
3. Copy the contents of [`../mangabuff_helper.js`](../mangabuff_helper.js) into it.
4. Save the script.
5. Open `mangabuff.ru` and use the `MB` button in the lower-left corner.

## Settings

The script includes separate modal windows for:

- auto-scroll;
- auto-quiz;
- auto-comments.

Each modal supports internal scrolling, and also includes scroll buttons if browser wheel scrolling is unreliable.

## Notes

- The script depends on the current DOM structure and request behavior of `mangabuff.ru`.
- If the site changes classes, footer markup, or endpoint behavior, some features may need to be updated.
- Comment posting can still be rejected by the website spam filter.
- Automating actions on a website may violate its rules. Use the script at your own risk.
