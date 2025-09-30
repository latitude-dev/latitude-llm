CREATE TABLE "latitude"."document_integration_references" (
	"workspace_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"commit_id" bigint NOT NULL,
	"document_uuid" uuid NOT NULL,
	"integration_id" bigint NOT NULL,
	CONSTRAINT "document_integration_references_document_uuid_commit_id_integration_id_pk" PRIMARY KEY("document_uuid","commit_id","integration_id")
);
--> statement-breakpoint
ALTER TABLE "latitude"."document_integration_references" ADD CONSTRAINT "document_integration_references_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."document_integration_references" ADD CONSTRAINT "document_integration_references_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "latitude"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."document_integration_references" ADD CONSTRAINT "document_integration_references_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "latitude"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."document_integration_references" ADD CONSTRAINT "document_integration_references_fk" FOREIGN KEY ("document_uuid","commit_id") REFERENCES "latitude"."document_versions"("document_uuid","commit_id") ON DELETE cascade ON UPDATE no action;