/**
 * Properties real Shopify Liquid documents for each object (shopify.dev/docs/api/liquid/objects).
 * Used only to classify a missing-property warning:
 *   in this list  → 'harness-gap'   (Shopify has it, our fixture/drop doesn't)
 *   not in list   → 'theme-suspect' (Shopify returns nil too → probably a theme bug)
 * UNCERTAIN lists names we could not verify offline (shopify.dev is blocked here).
 */
const s = (str) => new Set(str.split(/\s+/).filter(Boolean));

export const KNOWN = {
  shop: s(`accepts_gift_cards address brand collections_count currency customer_accounts_enabled customer_accounts_optional description domain email enabled_currencies enabled_locales enabled_payment_types id metafields metaobjects money_format money_with_currency_format name password_message permanent_domain phone policies privacy_policy products_count published_locales refund_policy secure_url shipping_policy subscription_policy taxes_included terms_of_service types url vendors`),
  product: s(`available collections compare_at_price compare_at_price_max compare_at_price_min compare_at_price_varies content created_at description featured_image featured_media first_available_variant gift_card? handle has_only_default_variant id images media metafields options options_by_name options_with_values price price_max price_min price_varies published_at quantity_price_breaks_configured? requires_selling_plan selected_or_first_available_selling_plan_allocation selected_or_first_available_variant selected_selling_plan selected_selling_plan_allocation selected_variant selling_plan_groups tags template_suffix title type url variants variants_count vendor category`),
  variant: s(`available barcode compare_at_price featured_image featured_media id image incoming inventory_management inventory_policy inventory_quantity matched metafields next_incoming_date option1 option2 option3 options price product quantity_price_breaks quantity_price_breaks_configured? quantity_rule requires_selling_plan requires_shipping selected selected_selling_plan_allocation selling_plan_allocations sku store_availabilities taxable title unit_price unit_price_measurement url weight weight_in_unit weight_unit`),
  image: s(`alt aspect_ratio attached_to_variant? height id media_type position presentation preview_image product_id src variants width`),
  media: s(`alt aspect_ratio duration external_id host id media_type position preview_image sources`),
  media_source: s(`format height mime_type url width`),
  collection: s(`all_products_count all_tags all_types all_vendors current_type current_vendor default_sort_by description featured_image filters handle id image metafields next_product previous_product products products_count published_at sort_by sort_options tags template_suffix title url`),
  page: s(`author content handle id metafields published_at template_suffix title url`),
  customer: s(`accepts_marketing addresses addresses_count b2b? company_available_locations company_available_locations_count current_company current_location default_address email first_name has_account has_avatar? id last_name last_order metafields name orders orders_count payment_methods phone store_credit_account tags tax_exempt total_spent new_address`),
  address: s(`address1 address2 city company country country_code first_name id last_name name phone province province_code street summary url zip`),
  order: s(`attributes billing_address cancel_reason cancel_reason_label cancelled cancelled_at cart_level_discount_applications created_at customer customer_order_url customer_url discount_applications email financial_status financial_status_label fulfillment_status fulfillment_status_label id item_count line_items line_items_subtotal_price metafields name note order_number order_status_url phone pickup_in_store? shipping_address shipping_methods shipping_price subtotal_line_items subtotal_price tags tax_lines tax_price total_discounts total_duties total_net_amount total_price total_refunded_amount transactions`),
  line_item: s(`discount_allocations error_message final_line_price final_price fulfillment fulfillment_service gift_card id image item_components key line_level_discount_allocations line_level_total_discount message options_with_values original_line_price original_price product product_id properties quantity requires_shipping selling_plan_allocation sku successfully_fulfilled_quantity taxable title unit_price unit_price_measurement url url_to_remove variant variant_id vendor`),
  fulfillment: s(`created_at fulfillment_line_items item_count tracking_company tracking_number tracking_numbers tracking_url`),
  cart: s(`attributes cart_level_discount_applications checkout_charge_amount currency discount_applications duties_included empty? item_count items items_subtotal_price note original_total_price requires_shipping taxes_included total_discount total_price total_weight`),
  request: s(`design_mode host locale origin page_type path visual_preview_mode`),
  locale: s(`endonym_name iso_code name primary root_url`),
  routes: s(`account_addresses_url account_login_url account_logout_url account_recover_url account_register_url account_url all_products_collection_url cart_add_url cart_change_url cart_clear_url cart_update_url cart_url collections_url predictive_search_url product_recommendations_url root_url search_url`),
  template: s(`directory name suffix`),
  theme: s(`id name role`),
  search: s(`default_sort_by filters performed results results_count sort_by sort_options terms types`),
  paginate: s(`current_offset current_page items next page_param page_size pages parts previous`),
  form: s(`address1 address2 author body city company country email errors first_name id last_name password_needed phone posted_successfully? province set_as_default_checkbox zip name`),
  section: s(`blocks id index index0 location settings`),
  block: s(`id settings shopify_attributes type`),
  policy: s(`body id title url`),
  store_credit_account: s(`balance`),
  money_currency: s(`iso_code name symbol`),
  gift_card: s(`balance code currency customer enabled expired expires_on initial_value last_four_characters pass_url product properties qr_identifier template_suffix url`),
  localization: s(`available_countries available_languages country language market`),
};

/** Names used by this theme that we could not verify against shopify.dev from this sandbox. */
export const UNCERTAIN = {
  routes: s(`storefront_login_url`),
  shop: s(`contact_information`),
};
