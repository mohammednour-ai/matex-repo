-- ============================================================================
-- MATEX - Seed Data: Material Categories
-- ============================================================================

INSERT INTO listing_mcp.categories (name, slug, description, default_unit, weight_tolerance, sort_order) VALUES
('Ferrous Metals', 'ferrous-metals', 'Steel scrap, cast iron, stainless steel, alloy steel', 'mt', 2.00, 1),
('Non-Ferrous Metals', 'non-ferrous-metals', 'Copper, aluminum, brass, zinc, lead, nickel', 'kg', 1.00, 2),
('Precious Metals', 'precious-metals', 'Gold, silver, platinum, palladium (from e-waste)', 'troy_oz', 0.50, 3),
('Plastics', 'plastics', 'PET, HDPE, PVC, LDPE, PP, PS, mixed plastics', 'kg', 3.00, 4),
('Paper & Cardboard', 'paper-cardboard', 'OCC, ONP, mixed paper, white paper', 'mt', 5.00, 5),
('Electronics (E-Waste)', 'e-waste', 'Circuit boards, cables, batteries, computers', 'kg', 2.00, 6),
('Rubber & Tires', 'rubber-tires', 'Whole tires, shredded rubber, tire chips', 'units', 2.00, 7),
('Textiles', 'textiles', 'Cotton waste, synthetic fibers, mixed textiles', 'kg', 3.00, 8),
('Glass', 'glass', 'Clear, amber, green, mixed cullet', 'mt', 3.00, 9),
('Construction & Demolition', 'construction-demolition', 'Concrete, wood, drywall, asphalt, bricks', 'cubic_yards', 5.00, 10),
('Surplus Inventory', 'surplus-inventory', 'Overstock, obsolete goods, returned merchandise', 'lots', 2.00, 11);

-- Subcategories: Ferrous Metals
INSERT INTO listing_mcp.categories (name, slug, parent_id, default_unit, weight_tolerance, sort_order) 
SELECT sub.name, sub.slug, c.category_id, 'mt', 2.00, sub.sort_order
FROM listing_mcp.categories c,
(VALUES 
  ('HMS 1 (Heavy Melting Steel)', 'hms-1', 1),
  ('HMS 2', 'hms-2', 2),
  ('Shredded Steel', 'shredded-steel', 3),
  ('Cast Iron', 'cast-iron', 4),
  ('Stainless Steel 304', 'stainless-304', 5),
  ('Stainless Steel 316', 'stainless-316', 6),
  ('Alloy Steel', 'alloy-steel', 7)
) AS sub(name, slug, sort_order)
WHERE c.slug = 'ferrous-metals';

-- Subcategories: Non-Ferrous Metals
INSERT INTO listing_mcp.categories (name, slug, parent_id, default_unit, weight_tolerance, sort_order)
SELECT sub.name, sub.slug, c.category_id, 'kg', 1.00, sub.sort_order
FROM listing_mcp.categories c,
(VALUES
  ('Copper #1 (Bare Bright)', 'copper-1-bare-bright', 1),
  ('Copper #2', 'copper-2', 2),
  ('Insulated Copper Wire', 'insulated-copper', 3),
  ('Aluminum Extrusion', 'aluminum-extrusion', 4),
  ('Aluminum Cans (UBC)', 'aluminum-cans-ubc', 5),
  ('Brass (Yellow)', 'brass-yellow', 6),
  ('Brass (Red)', 'brass-red', 7),
  ('Zinc', 'zinc', 8),
  ('Lead', 'lead', 9),
  ('Nickel', 'nickel', 10)
) AS sub(name, slug, sort_order)
WHERE c.slug = 'non-ferrous-metals';

-- Subcategories: Plastics
INSERT INTO listing_mcp.categories (name, slug, parent_id, default_unit, weight_tolerance, sort_order)
SELECT sub.name, sub.slug, c.category_id, 'kg', 3.00, sub.sort_order
FROM listing_mcp.categories c,
(VALUES
  ('PET (#1)', 'pet-1', 1),
  ('HDPE (#2)', 'hdpe-2', 2),
  ('PVC (#3)', 'pvc-3', 3),
  ('LDPE (#4)', 'ldpe-4', 4),
  ('PP (#5)', 'pp-5', 5),
  ('PS (#6)', 'ps-6', 6),
  ('Mixed Plastics', 'mixed-plastics', 7)
) AS sub(name, slug, sort_order)
WHERE c.slug = 'plastics';
