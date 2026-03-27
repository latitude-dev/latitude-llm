import * as aws from "@pulumi/aws"
import type { EnvironmentConfig } from "../config.ts"
import type { Ec2Instance, Ec2NatGateway, Ec2RouteTable, Ec2Subnet, Ec2Vpc } from "./types.ts"

export interface VpcOutput {
  vpc: Ec2Vpc
  publicSubnets: Ec2Subnet[]
  privateSubnets: Ec2Subnet[]
  natGateway?: Ec2NatGateway
  natInstance?: Ec2Instance
  publicRouteTable: Ec2RouteTable
  privateRouteTable?: Ec2RouteTable
}

export function createVpc(name: string, config: EnvironmentConfig): VpcOutput {
  const vpc = new aws.ec2.Vpc(`${name}-vpc`, {
    cidrBlock: config.vpcCidr,
    enableDnsHostnames: true,
    enableDnsSupport: true,
    tags: {
      Name: `${name}-vpc`,
      Environment: config.name,
    },
  })

  const azs = getAvailabilityZones(config.region, config.azCount)
  const publicSubnets: Ec2Subnet[] = []
  const privateSubnets: Ec2Subnet[] = []

  for (let i = 0; i < config.azCount; i++) {
    const az = azs[i]

    const publicSubnet = new aws.ec2.Subnet(`${name}-public-${i}`, {
      vpcId: vpc.id,
      cidrBlock: `10.${config.name === "staging" ? 0 : 1}.${i * 32}.0/20`,
      availabilityZone: az,
      mapPublicIpOnLaunch: true,
      tags: {
        Name: `${name}-public-${i}`,
        Environment: config.name,
        Type: "public",
      },
    })
    publicSubnets.push(publicSubnet)

    const privateSubnet = new aws.ec2.Subnet(`${name}-private-${i}`, {
      vpcId: vpc.id,
      cidrBlock: `10.${config.name === "staging" ? 0 : 1}.${i * 32 + 16}.0/20`,
      availabilityZone: az,
      mapPublicIpOnLaunch: false,
      tags: {
        Name: `${name}-private-${i}`,
        Environment: config.name,
        Type: "private",
      },
    })
    privateSubnets.push(privateSubnet)
  }

  const internetGateway = new aws.ec2.InternetGateway(`${name}-igw`, {
    vpcId: vpc.id,
    tags: {
      Name: `${name}-igw`,
      Environment: config.name,
    },
  })

  const publicRouteTable = new aws.ec2.RouteTable(`${name}-public-rt`, {
    vpcId: vpc.id,
    routes: [
      {
        cidrBlock: "0.0.0.0/0",
        gatewayId: internetGateway.id,
      },
    ],
    tags: {
      Name: `${name}-public-rt`,
      Environment: config.name,
    },
  })

  for (let i = 0; i < publicSubnets.length; i++) {
    new aws.ec2.RouteTableAssociation(`${name}-public-rta-${i}`, {
      subnetId: publicSubnets[i].id,
      routeTableId: publicRouteTable.id,
    })
  }

  let natGateway: Ec2NatGateway | undefined
  let natInstance: Ec2Instance | undefined
  let privateRouteTable: aws.ec2.RouteTable | undefined

  if (config.enableNat) {
    const eip = new aws.ec2.Eip(`${name}-nat-eip`, {
      domain: "vpc",
      tags: {
        Name: `${name}-nat-eip`,
        Environment: config.name,
      },
    })

    natGateway = new aws.ec2.NatGateway(`${name}-nat`, {
      allocationId: eip.allocationId,
      subnetId: publicSubnets[0].id,
      tags: {
        Name: `${name}-nat`,
        Environment: config.name,
      },
    })

    privateRouteTable = new aws.ec2.RouteTable(`${name}-private-rt`, {
      vpcId: vpc.id,
      routes: [
        {
          cidrBlock: "0.0.0.0/0",
          natGatewayId: natGateway.id,
        },
      ],
      tags: {
        Name: `${name}-private-rt`,
        Environment: config.name,
      },
    })

    for (let i = 0; i < privateSubnets.length; i++) {
      new aws.ec2.RouteTableAssociation(`${name}-private-rta-${i}`, {
        subnetId: privateSubnets[i].id,
        routeTableId: privateRouteTable.id,
      })
    }
  } else if (config.name === "staging") {
    const natSg = new aws.ec2.SecurityGroup(`${name}-nat-sg`, {
      vpcId: vpc.id,
      ingress: [
        {
          protocol: "-1",
          fromPort: 0,
          toPort: 0,
          cidrBlocks: [config.vpcCidr],
        },
      ],
      egress: [
        {
          protocol: "-1",
          fromPort: 0,
          toPort: 0,
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
      tags: {
        Name: `${name}-nat-sg`,
        Environment: config.name,
      },
    })

    const ami = aws.ec2.getAmiOutput({
      owners: ["568608671756"],
      mostRecent: true,
      filters: [
        {
          name: "name",
          values: ["fck-nat-al2023-*"],
        },
        {
          name: "architecture",
          values: ["arm64"],
        },
      ],
    })

    const natEip = new aws.ec2.Eip(`${name}-nat-instance-eip`, {
      domain: "vpc",
      tags: {
        Name: `${name}-nat-instance-eip`,
        Environment: config.name,
      },
    })

    natInstance = new aws.ec2.Instance(`${name}-nat-instance`, {
      instanceType: "t4g.nano",
      ami: ami.id,
      subnetId: publicSubnets[0].id,
      vpcSecurityGroupIds: [natSg.id],
      associatePublicIpAddress: true,
      sourceDestCheck: false,
      tags: {
        Name: `${name}-nat-instance`,
        Environment: config.name,
      },
    })

    new aws.ec2.EipAssociation(`${name}-nat-eip-assoc`, {
      instanceId: natInstance.id,
      allocationId: natEip.allocationId,
    })

    // We create the route table with empty routes here, then add routes separately below
    // via aws.ec2.Route resources. The ignoreChanges prevents Pulumi refresh from detecting
    // drift - it sees the added routes in AWS and incorrectly thinks they should be inline
    // on the parent resource, causing false positive "remove routes" diffs on every preview
    // after a refresh.
    privateRouteTable = new aws.ec2.RouteTable(
      `${name}-private-rt`,
      {
        vpcId: vpc.id,
        routes: [],
        tags: {
          Name: `${name}-private-rt`,
          Environment: config.name,
        },
      },
      { ignoreChanges: ["routes"] },
    )

    new aws.ec2.Route(`${name}-private-route`, {
      routeTableId: privateRouteTable.id,
      destinationCidrBlock: "0.0.0.0/0",
      networkInterfaceId: natInstance.primaryNetworkInterfaceId,
    })

    for (let i = 0; i < privateSubnets.length; i++) {
      new aws.ec2.RouteTableAssociation(`${name}-private-rta-${i}`, {
        subnetId: privateSubnets[i].id,
        routeTableId: privateRouteTable.id,
      })
    }
  }

  return {
    vpc,
    publicSubnets,
    privateSubnets,
    natGateway,
    natInstance,
    publicRouteTable,
    privateRouteTable,
  }
}

function getAvailabilityZones(region: string, count: number): string[] {
  const azs = [`${region}a`, `${region}b`, `${region}c`]
  return azs.slice(0, count)
}
