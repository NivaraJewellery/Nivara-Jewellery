# Delivered-order product reviews (v28)

## Flow
1. Admin changes a paid order status to **Delivered** and saves it.
2. The backend creates a secure random review token and emails the customer once.
3. The email button opens `/review.html?token=...` for that delivered order.
4. The customer can leave a 1–5 star review for each product in the order.
5. A product can be reviewed only once per order.
6. Submitted reviews are marked approved by default and appear in the storefront **Customer reviews** section.
7. `orders.review_email_sent_at` prevents duplicate review emails if the order status is changed again later.

## Existing environment variables used
- `DATABASE_URL`
- `RESEND_API_KEY`
- `FROM_EMAIL`

Optional URL override:
- `PUBLIC_SITE_URL=https://nivarajewellery.com`
  (If omitted, the review email uses the host of the Admin request.)

## Database additions
Created automatically by Admin Reports/Admin Init:
- `orders.review_email_sent_at`
- `order_review_tokens`
- `product_reviews`

## Acceptance test
1. Use a paid test order with a real test-customer email address.
2. In Admin Reports, change status to **Delivered** and click **Save status**.
3. Confirm toast: `Order delivered. Review email sent.`
4. Confirm the customer receives the review email.
5. Open **Write a product review** from the email.
6. Submit a star rating and review for one item.
7. Refresh the storefront and confirm the review appears under **Customer reviews**.
8. Save Delivered again and confirm no second review email is sent.
