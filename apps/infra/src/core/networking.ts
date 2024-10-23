import * as pulumi from '@pulumi/pulumi'

import { getPrivateSubnets, getPublicSubnets } from '../shared'

// New function to get EU Central subnets
const getEuCentralSubnets = async () => {
  const publicSubnets = await getPublicSubnets()
  const privateSubnets = await getPrivateSubnets()
  return {
    public: publicSubnets.ids,
    private: privateSubnets.ids,
  }
}

// Export all subnet information
export const subnets = pulumi.output(getEuCentralSubnets()).apply((euCentral) =>
  pulumi.output({
    all: {
      public: euCentral.public,
      private: euCentral.private,
    },
    euCentral: euCentral,
  }),
)
