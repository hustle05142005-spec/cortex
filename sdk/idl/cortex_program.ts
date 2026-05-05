/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/cortex_program.json`.
 */
export type CortexProgram = {
  "address": "DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV",
  "metadata": {
    "name": "cortexProgram",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Cortex — Solana-native infrastructure for AI agents (programmable wallet + skill marketplace)"
  },
  "instructions": [
    {
      "name": "closeAgentWallet",
      "docs": [
        "Owner-only: drain the vault, close the vault token account, and",
        "close the AgentWallet PDA. Rent and any remaining tokens flow",
        "back to the owner. Idempotent end-of-life for an agent."
      ],
      "discriminator": [
        126,
        71,
        219,
        130,
        157,
        136,
        98,
        77
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "agentWallet"
          ]
        },
        {
          "name": "agentWallet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent_wallet.agent",
                "account": "agentWallet"
              }
            ]
          }
        },
        {
          "name": "agentVault",
          "writable": true
        },
        {
          "name": "ownerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "closeSkill",
      "docs": [
        "Author-only: close a skill PDA and refund rent."
      ],
      "discriminator": [
        80,
        95,
        57,
        111,
        17,
        86,
        54,
        103
      ],
      "accounts": [
        {
          "name": "author",
          "writable": true,
          "signer": true,
          "relations": [
            "skill"
          ]
        },
        {
          "name": "skill",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  107,
                  105,
                  108,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "skill.slug",
                "account": "skill"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "createAgentWallet",
      "docs": [
        "Create an AgentWallet PDA owned by `owner` and addressable by the",
        "given `agent` pubkey. Also creates the wallet's ATA for `mint`."
      ],
      "discriminator": [
        243,
        173,
        1,
        184,
        209,
        14,
        51,
        108
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "Human owner / payer."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "agent"
        },
        {
          "name": "mint"
        },
        {
          "name": "agentWallet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "agentVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "agentWallet"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "perCallLimit",
          "type": "u64"
        },
        {
          "name": "dailyLimit",
          "type": "u64"
        }
      ]
    },
    {
      "name": "payForCall",
      "docs": [
        "Agent-signed payment for a single skill invocation. Settles",
        "`skill.price_per_call` from the agent's vault to the author's ATA",
        "and updates per-day accounting."
      ],
      "discriminator": [
        96,
        109,
        107,
        40,
        242,
        120,
        106,
        218
      ],
      "accounts": [
        {
          "name": "agent",
          "docs": [
            "The agent's signing key — typically held inside the agent",
            "runtime, never the human's wallet."
          ],
          "signer": true
        },
        {
          "name": "agentWallet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "agentVault",
          "writable": true
        },
        {
          "name": "skill",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  107,
                  105,
                  108,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "skill.slug",
                "account": "skill"
              }
            ]
          }
        },
        {
          "name": "authorTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "registerSkill",
      "docs": [
        "Register a paid skill. PDA seeded by `slug` so slugs are unique",
        "globally."
      ],
      "discriminator": [
        166,
        249,
        255,
        189,
        192,
        197,
        102,
        2
      ],
      "accounts": [
        {
          "name": "author",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "skill",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  107,
                  105,
                  108,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "slug"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "slug",
          "type": "string"
        },
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "description",
          "type": "string"
        },
        {
          "name": "manifestUri",
          "type": "string"
        },
        {
          "name": "pricePerCall",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateAgentLimits",
      "docs": [
        "Owner-only: change the spending policy on an existing wallet."
      ],
      "discriminator": [
        222,
        214,
        32,
        3,
        150,
        59,
        89,
        45
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "agentWallet"
          ]
        },
        {
          "name": "agentWallet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent_wallet.agent",
                "account": "agentWallet"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "perCallLimit",
          "type": "u64"
        },
        {
          "name": "dailyLimit",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateSkill",
      "docs": [
        "Author-only: change price or active flag."
      ],
      "discriminator": [
        116,
        142,
        164,
        86,
        9,
        27,
        112,
        227
      ],
      "accounts": [
        {
          "name": "author",
          "signer": true,
          "relations": [
            "skill"
          ]
        },
        {
          "name": "skill",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  107,
                  105,
                  108,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "skill.slug",
                "account": "skill"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newPrice",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "active",
          "type": {
            "option": "bool"
          }
        }
      ]
    },
    {
      "name": "withdraw",
      "docs": [
        "Owner-only: pull `amount` of the wallet's mint back to the",
        "owner's ATA. Skipping deposit ix because that's just an SPL",
        "transfer into the PDA's vault — no signature needed."
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "agentWallet"
          ]
        },
        {
          "name": "agentWallet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent_wallet.agent",
                "account": "agentWallet"
              }
            ]
          }
        },
        {
          "name": "agentVault",
          "writable": true
        },
        {
          "name": "ownerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "agentWallet",
      "discriminator": [
        127,
        35,
        180,
        143,
        201,
        1,
        100,
        50
      ]
    },
    {
      "name": "skill",
      "discriminator": [
        53,
        13,
        242,
        204,
        77,
        249,
        1,
        215
      ]
    }
  ],
  "events": [
    {
      "name": "agentLimitsUpdated",
      "discriminator": [
        74,
        63,
        86,
        154,
        66,
        206,
        154,
        113
      ]
    },
    {
      "name": "agentWalletClosed",
      "discriminator": [
        78,
        32,
        124,
        17,
        39,
        53,
        205,
        63
      ]
    },
    {
      "name": "agentWalletCreated",
      "discriminator": [
        3,
        111,
        163,
        233,
        246,
        175,
        232,
        231
      ]
    },
    {
      "name": "skillCalled",
      "discriminator": [
        87,
        58,
        159,
        193,
        164,
        48,
        10,
        88
      ]
    },
    {
      "name": "skillClosed",
      "discriminator": [
        35,
        11,
        101,
        83,
        186,
        207,
        171,
        82
      ]
    },
    {
      "name": "skillRegistered",
      "discriminator": [
        222,
        131,
        204,
        34,
        182,
        68,
        239,
        64
      ]
    },
    {
      "name": "skillUpdated",
      "discriminator": [
        168,
        10,
        44,
        211,
        219,
        5,
        98,
        98
      ]
    },
    {
      "name": "withdrawn",
      "discriminator": [
        20,
        89,
        223,
        198,
        194,
        124,
        219,
        13
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidLimit",
      "msg": "Per-call limit must be greater than zero."
    },
    {
      "code": 6001,
      "name": "dailyLimitBelowPerCall",
      "msg": "Daily limit must be at least the per-call limit."
    },
    {
      "code": 6002,
      "name": "amountIsZero",
      "msg": "Amount must be greater than zero."
    },
    {
      "code": 6003,
      "name": "invalidSlug",
      "msg": "Slug is invalid (empty, too long, or contains forbidden bytes)."
    },
    {
      "code": 6004,
      "name": "fieldTooLong",
      "msg": "Field exceeds the on-chain length limit."
    },
    {
      "code": 6005,
      "name": "invalidPrice",
      "msg": "Price must be greater than zero."
    },
    {
      "code": 6006,
      "name": "skillInactive",
      "msg": "Skill is currently disabled by its author."
    },
    {
      "code": 6007,
      "name": "mintMismatch",
      "msg": "Token mint does not match between accounts."
    },
    {
      "code": 6008,
      "name": "perCallLimitExceeded",
      "msg": "Skill price exceeds this agent's per-call limit."
    },
    {
      "code": 6009,
      "name": "dailyLimitExceeded",
      "msg": "Skill price would exceed this agent's daily limit."
    },
    {
      "code": 6010,
      "name": "overflow",
      "msg": "Numerical overflow."
    },
    {
      "code": 6011,
      "name": "unauthorized",
      "msg": "Caller is not authorised for this action."
    }
  ],
  "types": [
    {
      "name": "agentLimitsUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agentWallet",
            "type": "pubkey"
          },
          {
            "name": "perCallLimit",
            "type": "u64"
          },
          {
            "name": "dailyLimit",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "agentWallet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "perCallLimit",
            "type": "u64"
          },
          {
            "name": "dailyLimit",
            "type": "u64"
          },
          {
            "name": "dailySpent",
            "type": "u64"
          },
          {
            "name": "dayStartTs",
            "type": "i64"
          },
          {
            "name": "totalCalls",
            "type": "u64"
          },
          {
            "name": "totalSpent",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "agentWalletClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agentWallet",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "drained",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "agentWalletCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agentWallet",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "perCallLimit",
            "type": "u64"
          },
          {
            "name": "dailyLimit",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "skill",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "author",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "slug",
            "type": "string"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "manifestUri",
            "type": "string"
          },
          {
            "name": "pricePerCall",
            "type": "u64"
          },
          {
            "name": "totalCalls",
            "type": "u64"
          },
          {
            "name": "totalRevenue",
            "type": "u64"
          },
          {
            "name": "active",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "skillCalled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "skill",
            "type": "pubkey"
          },
          {
            "name": "agentWallet",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "author",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "skillClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "skill",
            "type": "pubkey"
          },
          {
            "name": "author",
            "type": "pubkey"
          },
          {
            "name": "slug",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "skillRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "skill",
            "type": "pubkey"
          },
          {
            "name": "author",
            "type": "pubkey"
          },
          {
            "name": "slug",
            "type": "string"
          },
          {
            "name": "pricePerCall",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "skillUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "skill",
            "type": "pubkey"
          },
          {
            "name": "pricePerCall",
            "type": "u64"
          },
          {
            "name": "active",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "withdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agentWallet",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
