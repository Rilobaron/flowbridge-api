import mongoose from "mongoose";
import { encrypt, decrypt, maskSecret } from "../services/encryptionService.js";
import {
  INBOUND_AUTH_TYPE,
  OUTBOUND_AUTH_TYPE,
  HTTP_METHODS,
} from "../constants/index.js";

const destinationAuthSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: Object.values(OUTBOUND_AUTH_TYPE),
      default: OUTBOUND_AUTH_TYPE.NONE,
    },
    token: {
      type: String,
      default: null,
    },
    username: {
      type: String,
      default: null,
    },
    password: {
      type: String,
      default: null,
    },
    apiKey: {
      type: String,
      default: null,
    },
    apiKeyHeader: {
      type: String,
      default: "X-API-Key",
    },
    tokenUrl: {
      type: String,
      default: null,
    },
    clientId: {
      type: String,
      default: null,
    },
    clientSecret: {
      type: String,
      default: null,
    },
    scope: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

export const destinationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "primary",
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    method: {
      type: String,
      enum: HTTP_METHODS,
      default: "POST",
    },
    headers: {
      type: Map,
      of: String,
      default: {},
    },
    mapping: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // Filtro condicional específico para este destino
    filter: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    authentication: {
      type: destinationAuthSchema,
      default: () => ({}),
    },
    timeout: {
      type: Number,
      default: null,
    },
  },
  { _id: true }
);

const integrationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    // URL opcional para notificação de alertas (Slack, Discord, PagerDuty) em Dead Letter
    alertWebhookUrl: {
      type: String,
      trim: true,
      default: null,
    },

    source: {
      authenticationType: {
        type: String,
        enum: Object.values(INBOUND_AUTH_TYPE),
        default: INBOUND_AUTH_TYPE.NONE,
      },
      secret: {
        type: String,
        default: null,
      },
      headerName: {
        type: String,
        default: null,
      },
    },

    destinations: {
      type: [destinationSchema],
      default: [],
    },

    // Filtro condicional global da integração
    filter: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    mapping: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    retryPolicy: {
      enabled: {
        type: Boolean,
        default: true,
      },
      maxAttempts: {
        type: Number,
        default: 3,
        min: 1,
        max: 10,
      },
      initialDelay: {
        type: Number,
        default: 1000,
      },
      multiplier: {
        type: Number,
        default: 2,
        min: 1,
      },
      maxDelay: {
        type: Number,
        default: 60000,
      },
    },

    timeout: {
      type: Number,
      default: 5000,
      min: 500,
      max: 60000,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual para manter retrocompatibilidade com integration.destination
integrationSchema.virtual("destination").get(function () {
  return this.destinations && this.destinations.length > 0 ? this.destinations[0] : null;
}).set(function (dest) {
  if (dest) {
    if (!this.destinations || this.destinations.length === 0) {
      this.destinations = [dest];
    } else {
      this.destinations[0] = dest;
    }
  }
});

// Hook para criptografar secrets antes de salvar
integrationSchema.pre("save", function () {
  if (this.isModified("source.secret") && this.source?.secret) {
    this.source.secret = encrypt(this.source.secret);
  }

  if (this.destinations && Array.isArray(this.destinations)) {
    for (const dest of this.destinations) {
      if (dest.authentication) {
        if (dest.authentication.token && !dest.authentication.token.includes(":")) {
          dest.authentication.token = encrypt(dest.authentication.token);
        }
        if (dest.authentication.password && !dest.authentication.password.includes(":")) {
          dest.authentication.password = encrypt(dest.authentication.password);
        }
        if (dest.authentication.apiKey && !dest.authentication.apiKey.includes(":")) {
          dest.authentication.apiKey = encrypt(dest.authentication.apiKey);
        }
        if (dest.authentication.clientSecret && !dest.authentication.clientSecret.includes(":")) {
          dest.authentication.clientSecret = encrypt(dest.authentication.clientSecret);
        }
      }
    }
  }
});

// Método para recuperar credenciais descriptografadas de um destino específico
integrationSchema.methods.getDecryptedCredentials = function (destinationIndex = 0) {
  const dest = this.destinations && this.destinations[destinationIndex] ? this.destinations[destinationIndex] : this.destination;
  const auth = dest?.authentication;

  return {
    sourceSecret: this.source?.secret ? decrypt(this.source.secret) : null,
    destinationToken: auth?.token ? decrypt(auth.token) : null,
    destinationPassword: auth?.password ? decrypt(auth.password) : null,
    destinationApiKey: auth?.apiKey ? decrypt(auth.apiKey) : null,
    destinationClientSecret: auth?.clientSecret ? decrypt(auth.clientSecret) : null,
    destinationUsername: auth?.username || null,
    destinationClientId: auth?.clientId || null,
  };
};

// Oculta e mascara credenciais ao serializar para JSON nas respostas da API
integrationSchema.methods.toJSON = function () {
  const obj = this.toObject();

  if (obj.source?.secret) {
    obj.source.secret = maskSecret(obj.source.secret);
  }

  if (obj.destinations && Array.isArray(obj.destinations)) {
    for (const dest of obj.destinations) {
      if (dest.authentication) {
        if (dest.authentication.token) dest.authentication.token = maskSecret(dest.authentication.token);
        if (dest.authentication.password) dest.authentication.password = maskSecret(dest.authentication.password);
        if (dest.authentication.apiKey) dest.authentication.apiKey = maskSecret(dest.authentication.apiKey);
        if (dest.authentication.clientSecret) dest.authentication.clientSecret = maskSecret(dest.authentication.clientSecret);
      }
    }
  }

  if (obj.destinations && obj.destinations.length > 0) {
    obj.destination = obj.destinations[0];
  }

  return obj;
};

const Integration = mongoose.model("Integration", integrationSchema);

export default Integration;
