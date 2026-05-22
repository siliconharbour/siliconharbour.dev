---
id: s-df53
status: closed
deps: []
links: []
created: 2026-05-22T20:16:24Z
type: task
priority: 1
assignee: Jack Arthur Harrhy
parent: s-2aa6
tags: [backend, frontend, discord]
---
# Discord: posting fan-out + per-destination history

Rewrite event/jobs post actions to loop destinations, generate one batch_id (crypto.randomUUID), insert one discord_posts row per destination with shared batch_id, post to each channel. Update history list to group by batch_id (showing 'Posted to 3 channels'). Per-channel Undo and Undo-All-In-Batch buttons. Skip flow likewise records one row per destination so item is fully dealt with.

## Acceptance Criteria

Posting with 0 destinations returns an error pointing to settings. With 2 destinations: 2 messages sent, 2 discord_posts rows same batch_id, items dealt-with via discord_post_items linked to first row only (avoid duplicate item rows). Partial failure: surfaces a list of (channel, error). Undo-batch deletes all rows in batch (cascades items). Per-channel undo only deletes that one row; items remain dealt-with as long as any sibling row in batch survives.

