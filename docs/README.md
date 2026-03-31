# Documentation

[English](./README.md) | [Русский](./ru/README_ru.md)

## Mangabuff Helper

`Mangabuff Helper` is a Tampermonkey userscript for `mangabuff.ru` that combines quiz automation, chapter auto-scrolling, chapter likes and comments, and mine automation in one control panel.

## Files

- `../mangabuff_helper.js` is the only working userscript in the repository.
- `../mangabuff_autoquiz.js` is a legacy compatibility stub. The autoquiz logic was merged into `mangabuff_helper.js` and should not be installed separately.

## Features

- `AutoQuiz`
  Starts a quiz on supported quiz pages, reads `correct_text` from the API response, and keeps answering until the quiz ends.
- `AutoScroll`
  Works on reader pages, scrolls the chapter, finds the next chapter button in the footer, opens the next chapter, and disables itself when there is no next chapter.
- `Auto Like`
  While auto-scroll is active, the script sends one `/favourite` request for each chapter using the chapter id from the reader like button.
- `Auto Comment`
  While auto-scroll is active, the script tries to send one random short comment every 2 or 4 chapters.
- `AutoMine`
  Sends `POST /mine/hit` through XHR and disables itself if the request fails or the daily limit is reached.
- `Control Panel`
  Shows checkboxes, live statuses, and a modal for tuning scroll strength and scroll interval.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Create a new userscript.
3. Copy the contents of [`../mangabuff_helper.js`](../mangabuff_helper.js) into it.
4. Save the script.
5. Open `mangabuff.ru` and use the `MB` button in the lower-left corner.

## Usage

1. Open any page on `mangabuff.ru`.
2. Click the `MB` floating button.
3. Enable the modules you want.
4. For chapter pages, open the auto-scroll settings modal and adjust:
   - scroll strength in pixels per step;
   - interval between scroll ticks in milliseconds.

## Reader Flow

On supported chapter pages the script:

1. Detects the current chapter id from `.reader-menu__item--like`.
2. Sends one like request for that chapter.
3. Counts chapters and randomly decides whether to comment on the 2nd or 4th chapter.
4. Scrolls until the footer is reached.
5. Follows the `След. глава` link if present.
6. Disables auto-scroll when no next chapter link is available.

## Notes

- The script depends on the current DOM structure and API behavior of `mangabuff.ru`.
- If the site changes class names, request payloads, or footer markup, some features may stop working until updated.
- Comment posting can still be rejected by the website spam filter.
- Automating actions on a website may violate its rules. Use the script at your own risk.
