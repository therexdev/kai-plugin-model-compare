# KAI Model Compare

Compare two installed local models using the same prompt and output limit. Requires **KAI Core 0.2.0 or later** and at least one installed, ready text model.

The window follows the original Compare models screen: model selectors, example prompts, one shared prompt, and two answer panels. New comparisons randomize the answer order and keep the model labels hidden until **Reveal models**. Pick Answer 1, Answer 2, or Tie to save your preference with that comparison. Dismiss notices with their X.

## What it does

- Runs real local inference for model A and then model B, with no cloud fallback.
- Shows independent responses, elapsed times, word counts, and individual failure messages side by side.
- Allows two independent runs of the same model when only one model is installed.
- Saves recent comparisons and model preferences in the plugin's private local storage.
- Reopens saved prompts and responses, and removes saved comparisons after confirmation.

The models run **sequentially**, sharing your device's resources. Timing includes model loading and is useful for everyday comparison; it is not a controlled throughput benchmark. Selecting **Stop after current** lets the current request finish and skips the next one. Closing the plugin cancels active work through Core.

## Install and use

1. Install KAI Core 0.2.0 or later. Download this repository's signed `.kaiplugin` asset from Releases.
2. In Core → Plugins, install the downloaded package after reviewing its publisher and requested capabilities.
3. Open Model Compare, choose the models, enter a prompt, and select **Compare models**. Install additional models in Core → Models and use Refresh models to see them.

Saved comparisons use a rolling history of up to **12 comparisons**, within a 650 KB UTF-8 storage budget. The oldest comparisons are removed when needed and the save status reports that change. A single comparison larger than this budget stays visible but cannot be saved; select and copy its text before closing. Failed storage writes keep the result visible and offer **Retry saving**. Unreadable stored history is preserved rather than silently reset.

This version compares plain text only. It does not install models, access Brain or shared chat history, call remote agents, read account tokens, or evaluate model quality automatically. Any example prompt is an editable starting point; responses always come from the selected model.

## Capabilities

| Permission | Purpose |
| --- | --- |
| `models.read` | List installed local models |
| `inference.local` | Generate each model's response |
| `storage.read`, `storage.write` | Save private comparison history and preferences |

The renderer runs in Core's isolated sandbox and only calls `window.kai.call`. It has no Node.js, raw filesystem, wallet, microphone, or direct network access.

## Development

There is no frontend build or dependency install step. `plugin/` contains the HTML, CSS, JavaScript, and schema-1/API-2 manifest. Run `npm test` to test request validation, model availability, UTF-8 history budgets, preservation of unreadable data, and result summaries.

Native integration requires a KAI Core checkout. The release workflow verifies the pre-signed package against the publisher key and exact source contents before publishing. Publisher private keys must never be committed.
