# DIWALI10 — Diwali campaign

- Code: `DIWALI10`
- Discount: 10%
- Starts: 13 October 2026 at 8:00 PM IST (`2026-10-13T14:30:00.000Z`)
- Ends: 9 November 2026 at 11:59 PM IST (exclusive cutoff `2026-11-09T18:30:00.000Z`)

## Updated in this archive
- `app.js`: offer settings, announcement banner and WhatsApp enquiry message (when active).
- The announcement checks the browser clock every 30 seconds; this is display logic, not authoritative discount enforcement.

## Important: missing backend
This supplied archive references `lib/handlers/promo` and other `lib/handlers` modules, but the `lib` directory is absent. Server-side coupon validation and redemption cannot be updated or verified from this archive. Before live deployment, obtain the full latest source and configure backend promo code, percentage and UTC dates. If the deployed backend supports `LAUNCH_PROMO_CODE`, `LAUNCH_PROMO_PERCENT`, `LAUNCH_PROMO_START`, `LAUNCH_PROMO_END`, set those to the values above. Check the actual backend implementation first.

This ZIP appears to be an older checkout-enabled version, not necessarily the current WhatsApp-only production version. Do not deploy over the current live site without comparing versions.
