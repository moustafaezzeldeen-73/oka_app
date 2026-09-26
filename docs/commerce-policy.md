# Commerce policy

**Shipping matches the website.** For every quote and order with an address,
the fee is the store's own Shopify rate for that address and basket
(`draftOrderCalculate` → available shipping rates, cheapest one), and the
order's shipping line carries that rate's name. Before an address is chosen,
the app estimates from a copy of the store's fee table in `server/config/zones.js`:

| Zone | Under 300 EGP | 300 EGP and over |
| --- | --- | --- |
| Cairo, Giza, 6th of October, Helwan, Alexandria | 60 | 36 |
| Delta and Canal | 70 | 46 |
| Upper Egypt, Sinai, Red Sea, Matrouh, New Valley | 80 | 56 |

Update that table if the store's delivery profiles change; orders themselves
always follow Shopify.

The rest lives in `server/config/policy.js` and can be overridden from the
environment:

| | Default | Why |
| --- | --- | --- |
| Minimum order | 150 EGP | Below ~141 EGP a COD order loses money once failed deliveries (15%, ~80 EGP courier cost each) are counted. The website has none; `MIN_ORDER_EGP=0` matches it |
| Payment methods | Cash on delivery | Card and wallet appear only once a gateway is connected (`PAYMENT_GATEWAY`) |
| Prepaid perk | 10 EGP off the store's shipping rate | Prepaid removes ~12 EGP of expected failure cost; gateway fees take most of it. Off until a gateway is connected |
| Loyalty earn | 1 point per EGP of delivered product — 10% back | The store's choice. Credited only after delivery, so refused parcels earn nothing |
| Loyalty redeem | 200 pts → 20 off 300+, 500 → 50 off 600+, 800 → 80 off 800+, 1500 → 150 off 1,500+ | 10 points = 1 EGP. Each reward is a single-use voucher code worth at most 10% of its minimum basket |
| Subscribe & Save | 5% off, every frequency | The old 15% weekly tier gave away more than the whole margin |

Points earning starts only when `LOYALTY_START_DATE` is set, and only for
orders created on or after it, so switching it on doesn't credit the whole
order history at once.

---
