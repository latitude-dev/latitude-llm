import { Latitude } from '@latitude-data/sdk'

type Tools = {
  get_customer_details: { email: string }
  get_order_history: { customer_id: string }
  check_known_issues: { issue_keywords: string[] }
}

async function run() {
  const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
    projectId: Number(process.env.PROJECT_ID),
    versionUuid: 'live',
  })

  const response = await sdk.prompts.run<Tools>('customer-support-email/main', {
    parameters: {
      customer_email: 'johndoe@gmail.com',
      customer_query: 'My order is delayed and I want to know the status.',
      priority_level: 'urgent',
    },
    tools: {
      get_customer_details: async ({ email }) => {
        return {
          email,
          name: 'John',
          last_name: 'Doe',
          customer_id: '12345',
        }
      },
      get_order_history: async ({ customer_id }) => {
        return {
          customer_id,
          orders: [
            {
              name: 'Nike Air Max 270',
              status: 'Delivered',
              date: '2023-01-01',
            },
            {
              name: 'Adidas Ultraboost',
              status: 'In Transit',
              date: '2023-02-01',
            },
          ],
        }
      },
      check_known_issues: async ({ issue_keywords }) => {
        if (issue_keywords.length === 0) {
          return { issues: [] }
        }

        if (issue_keywords.includes('delay')) {
          return {
            issues: [
              {
                description:
                  'Known issue with delayed shipments due to supply chain disruptions.',
                severity: 'high',
              },
            ],
          }
        }

        return { issues: [] }
      },
    },
  })

  console.log('RESPONSE', JSON.stringify(response, null, 2))
}

run()
