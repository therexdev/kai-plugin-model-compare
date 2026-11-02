# Compare Models 0.3.2

Follows the language saved in Core Settings, including changes to open views. Supports English, Spanish, Brazilian Portuguese, French and German with offline catalogs. Core owns the first-run choice; plugin content and identifiers stay literal. Requires Core 0.7.17 or newer.

## Previous release

Compare Models 0.3.1

Fixes comparisons stuck at the first message or showing only an occasional word. The renderer now continues checking streams through empty polls, handles split events and final tokens correctly, and displays upstream errors instead of leaving a generation running forever.

Stop cancels requests while waiting for model preparation or response headers, including late responses. A stopped comparison does not start its second model. Preparing and answering have distinct states, and reply length can be set from 512 to 4,096 tokens (1,024 by default).

Use KAI Core Beta 0.7.9 or later for the matching shared-model queue and cancellation fixes. Comparisons and saved voting scores stay in the existing plugin data folder.
