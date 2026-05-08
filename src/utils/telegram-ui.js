function mainMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Mint NFT", callback_data: "menu:mint" },
          { text: "Portfolio", callback_data: "menu:portfolio" },
        ],
        [
          { text: "Wallet Tracker", callback_data: "menu:wallet_tracker" },
          { text: "Revoke Checker", callback_data: "menu:revoke_checker" },
        ],
        [
          { text: "Copy Trade", callback_data: "menu:copy_trade" },
          { text: "Sniper Bot", callback_data: "menu:sniper_bot" },
        ],
      ],
    },
  }
}

function mintChainsKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Base", callback_data: "mint_help:base" },
          { text: "Ethereum", callback_data: "mint_help:eth" },
          { text: "Sepolia", callback_data: "mint_help:sepolia" },
        ],
        [
          { text: "Arbitrum", callback_data: "mint_help:arbitrum" },
          { text: "Optimism", callback_data: "mint_help:optimism" },
        ],
        [
          { text: "Polygon", callback_data: "mint_help:polygon" },
          { text: "BSC", callback_data: "mint_help:bsc" },
        ],
      ],
    },
  }
}

function confirmMintKeyboard({ functionCount }) {
  const quantityButtons = [
    { text: "Mint 1", callback_data: "confirmmint:1:1" },
    { text: "Mint 2", callback_data: "confirmmint:2:1" },
    { text: "Mint 3", callback_data: "confirmmint:3:1" },
  ]

  const functionButtons = Array.from({ length: functionCount }, (_, index) => ({
    text: `Fn ${index + 1}`,
    callback_data: `mint_fn_help:${index + 1}`,
  }))

  return {
    reply_markup: {
      inline_keyboard: [
        quantityButtons,
        functionButtons,
      ],
    },
  }
}

module.exports = {
  confirmMintKeyboard,
  mainMenuKeyboard,
  mintChainsKeyboard,
}
