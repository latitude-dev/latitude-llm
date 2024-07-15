-- Trigger to update closure tree on new node created
CREATE OR REPLACE FUNCTION document_versions_insert_trigger()
RETURNS TRIGGER AS
$BODY$
BEGIN
  INSERT INTO "latitude"."document_hierarchies" (parent_id, child_id, depth)
  SELECT p.parent_id, NEW.id, p.depth + 1
  FROM "latitude"."document_hierarchies" AS p
  WHERE p.child_id = NEW.parent_id;

  INSERT INTO "latitude"."document_hierarchies" (parent_id, child_id, depth)
  SELECT NEW.id, NEW.id, 0;

  RETURN NEW;
END;
$BODY$
LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER after_document_versions_insert
AFTER INSERT ON "latitude"."document_versions"
FOR EACH ROW
  EXECUTE FUNCTION document_versions_insert_trigger();


-- Trigger to update closure tree on deleting a node
CREATE OR REPLACE FUNCTION document_versions_delete_trigger()
RETURNS TRIGGER AS
$BODY$
BEGIN
  DELETE FROM "latitude"."document_hierarchies"
  WHERE child_id IN (SELECT child_id FROM "latitude"."document_hierarchies" WHERE parent_id = OLD.id)
  AND parent_id NOT IN (SELECT child_id FROM "latitude"."document_hierarchies" WHERE parent_id = OLD.id);

  DELETE FROM "latitude"."document_hierarchies"
  WHERE child_id = OLD.id AND parent_id = OLD.id;

  RETURN OLD;
END;
$BODY$
LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER after_document_versions_delete
AFTER DELETE ON "latitude"."document_versions"
FOR EACH ROW
  EXECUTE FUNCTION document_versions_delete_trigger();


-- Trigger to update closure tree on reparenting
CREATE OR REPLACE FUNCTION document_versions_update_trigger()
RETURNS TRIGGER AS
$BODY$
BEGIN
  IF NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id THEN
    RETURN NEW;
  END IF;

  DELETE FROM "latitude"."document_hierarchies"
  WHERE child_id IN (SELECT child_id FROM "latitude"."document_hierarchies" WHERE parent_id = NEW.id)
  AND parent_id NOT IN (SELECT child_id FROM "latitude"."document_hierarchies" WHERE parent_id = NEW.id);

  -- rebuild relations for all document children
  INSERT INTO "latitude"."document_hierarchies" (parent_id, child_id, depth)
  SELECT p.parent_id, c.child_id, p.depth + c.depth + 1
  FROM "latitude"."document_hierarchies" AS p
  CROSS JOIN "latitude"."document_hierarchies" AS c
  WHERE c.parent_id = NEW.id
  AND p.child_id = NEW.parent_id;

  RETURN NEW;
END;
$BODY$
LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER after_document_versions_update
AFTER UPDATE ON "latitude"."document_versions"
FOR EACH ROW
  EXECUTE FUNCTION document_versions_update_trigger();
