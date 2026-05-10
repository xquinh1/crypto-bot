const tools = [
  {
    type: "function",
    function: {
      name: "balance",
      description: "Check native coin balance on one supported chain or all chains.",
      parameters: {
        type: "object",
        properties: {
          chainSlug: {
            type: "string",
            description: "Chain slug, for example eth, sepolia, base, arbitrum, optimism, polygon, bsc, or all.",
          },
          address: {
            type: "string",
            description: "Optional wallet address. Defaults to bot wallet.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mint",
      description: "Detect an NFT mint request and route the user to the guarded mint flow.",
      parameters: {
        type: "object",
        required: ["contractAddress"],
        properties: {
          chainSlug: { type: "string" },
          contractAddress: { type: "string" },
          quantity: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transfer",
      description: "Transfer native coin or ERC20 token.",
      parameters: {
        type: "object",
        required: ["to", "amount"],
        properties: {
          chainSlug: { type: "string" },
          to: { type: "string" },
          amount: { type: "string" },
          tokenAddress: {
            type: "string",
            description: "ERC20 token address. Omit for native coin transfer.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "approve",
      description: "Approve an ERC20 spender.",
      parameters: {
        type: "object",
        required: ["tokenAddress", "spender"],
        properties: {
          chainSlug: { type: "string" },
          tokenAddress: { type: "string" },
          spender: { type: "string" },
          amount: {
            type: "string",
            description: "Token amount. Use max or unlimited for MaxUint256.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_project_link",
      description: "Inspect a crypto project website link when the user wants to mine, farm, claim, airdrop, or interact with a project through its website.",
      parameters: {
        type: "object",
        required: ["url", "goal"],
        properties: {
          url: {
            type: "string",
            description: "The project website URL shared by the user.",
          },
          goal: {
            type: "string",
            description: "What the user wants to do on the project, for example mine token, farm points, claim airdrop, or mint.",
          },
        },
      },
    },
  },
]

module.exports = {
  tools,
}
