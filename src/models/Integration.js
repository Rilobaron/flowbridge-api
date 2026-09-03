import mongoose from "mongoose";
import { encrypt, decrypt, maskSecret } from "../services/encryptionService.js";
import {
  INBOUND_AUTH_TYPE,
  OUTBOUND_AUTH_TYPE,
  HTTP_METHODS,
} from "../constants/index.js";

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
        default: null, // Custom header para API Key ou HMAC (ex: x-signature)
      },
    },

    destination: {
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
      authentication: {
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
      },
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
        default: 1000, // em ms
      },
      multiplier: {
        type: Number,
        default: 2,
        min: 1,
      },
      maxDelay: {
        type: Number,
        default: 60000, // 1 min max delay
      },
    },

    timeout: {
      type: Number,
      default: 5000, // 5 segundos
      min: 500,
      max: 60000,
    },
  },
  {
    timestamps: true,
  }
);

// Hook para criptografar secrets antes de salvar
integrationSchema.pre("save", function () {
  if (this.isModified("source.secret") && this.source?.secret) {
    this.source.secret = encrypt(this.source.secret);
  }

  if (this.isModified("destination.authentication.token") && this.destination?.authentication?.token) {
    this.destination.authentication.token = encrypt(this.destination.authentication.token);
  }

  if (this.isModified("destination.authentication.password") && this.destination?.authentication?.password) {
    this.destination.authentication.password = encrypt(this.destination.authentication.password);
  }

  if (this.isModified("destination.authentication.apiKey") && this.destination?.authentication?.apiKey) {
    this.destination.authentication.apiKey = encrypt(this.destination.authentication.apiKey);
  }
});

// Método para recuperar credenciais descriptografadas para execução do worker
integrationSchema.methods.getDecryptedCredentials = function () {
  const result = {
    sourceSecret: this.source?.secret ? decrypt(this.source.secret) : null,
    destinationToken: this.destination?.authentication?.token ? decrypt(this.destination.authentication.token) : null,
    destinationPassword: this.destination?.authentication?.password ? decrypt(this.destination.authentication.password) : null,
    destinationApiKey: this.destination?.authentication?.apiKey ? decrypt(this.destination.authentication.apiKey) : null,
    destinationUsername: this.destination?.authentication?.username || null,
  };
  return result;
};

// Oculta e mascara credenciais ao serializar para JSON nas respostas da API
integrationSchema.methods.toJSON = function () {
  const obj = this.toObject();

  if (obj.source?.secret) {
    obj.source.secret = maskSecret(obj.source.secret);
  }

  if (obj.destination?.authentication) {
    const auth = obj.destination.authentication;
    if (auth.token) auth.token = maskSecret(auth.token);
    if (auth.password) auth.password = maskSecret(auth.password);
    if (auth.apiKey) auth.apiKey = maskSecret(auth.apiKey);
  }

  return obj;
};

const Integration = mongoose.model("Integration", integrationSchema);

export default Integration;
