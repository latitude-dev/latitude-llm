import { SEED_DATASET_ID, SEED_ORG_ID } from "@domain/shared"
import { insertJsonEachRow } from "../../sql.ts"
import type { Seeder } from "../types.ts"

const XACT_ID = 1

const rows = [
  { code: "grey37", firstName: "Laura", lastName: "Grey", identifier: 2070 },
  { code: "blue12", firstName: "Craig", lastName: "Johnson", identifier: 2071 },
  { code: "red88", firstName: "Sara", lastName: "Martinez", identifier: 2072 },
  { code: "green45", firstName: "David", lastName: "Chen", identifier: 2073 },
  { code: "grey21", firstName: "Emily", lastName: "Grey", identifier: 2074 },
  {
    code: "yellow09",
    firstName: "Marcus",
    lastName: "Williams",
    identifier: 2075,
  },
  { code: "blue55", firstName: "Anna", lastName: "Kowalski", identifier: 2076 },
  { code: "red03", firstName: "James", lastName: "Brown", identifier: 2077 },
  { code: "grey99", firstName: "Sofia", lastName: "Grey", identifier: 2078 },
  { code: "green11", firstName: "Omar", lastName: "Hassan", identifier: 2079 },
  { code: "blue77", firstName: "Lucia", lastName: "Rossi", identifier: 2080 },
  { code: "red41", firstName: "Thomas", lastName: "Müller", identifier: 2081 },
  { code: "grey63", firstName: "Priya", lastName: "Sharma", identifier: 2082 },
  {
    code: "yellow33",
    firstName: "Robert",
    lastName: "Taylor",
    identifier: 2083,
  },
  { code: "green78", firstName: "Yuki", lastName: "Tanaka", identifier: 2084 },
  { code: "blue29", firstName: "Elena", lastName: "Popov", identifier: 2085 },
  { code: "grey14", firstName: "Michael", lastName: "Grey", identifier: 2086 },
  {
    code: "red56",
    firstName: "Fatima",
    lastName: "Al-Rashid",
    identifier: 2087,
  },
  {
    code: "yellow72",
    firstName: "Henrik",
    lastName: "Larsson",
    identifier: 2088,
  },
  {
    code: "green02",
    firstName: "Camille",
    lastName: "Dubois",
    identifier: 2089,
  },
]

const datasetRows = rows.map((r, i) => ({
  organization_id: SEED_ORG_ID,
  dataset_id: SEED_DATASET_ID,
  row_id: `seed-row-${String(i + 1).padStart(3, "0")}`,
  xact_id: XACT_ID,
  input: JSON.stringify({ code: r.code }),
  output: JSON.stringify({ firstName: r.firstName, lastName: r.lastName }),
  metadata: JSON.stringify({ identifier: r.identifier }),
}))

const seedDatasetRows: Seeder = {
  name: "datasets/big-comma-delimiter-rows",
  run: (ctx) => insertJsonEachRow(ctx.client, "dataset_rows", datasetRows),
}

export const datasetRowSeeders: Seeder[] = [seedDatasetRows]
