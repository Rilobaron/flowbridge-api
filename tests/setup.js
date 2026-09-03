import mongoose from "mongoose";
import { beforeAll, beforeEach } from "vitest";
import Integration from "../src/models/Integration.js";
import Event from "../src/models/Event.js";
import EventLog from "../src/models/EventLog.js";
import Delivery from "../src/models/Delivery.js";
import DeliveryAttempt from "../src/models/DeliveryAttempt.js";

const db = {
  Integration: [],
  Event: [],
  EventLog: [],
  Delivery: [],
  DeliveryAttempt: [],
};

function matchFilter(doc, filter = {}) {
  if (!filter || Object.keys(filter).length === 0) return true;

  for (const [key, value] of Object.entries(filter)) {
    if (key === "$or" && Array.isArray(value)) {
      const orMatched = value.some((subFilter) => matchFilter(doc, subFilter));
      if (!orMatched) return false;
      continue;
    }

    if (key === "_id") {
      const docId = (doc._id || "").toString();
      if (value && typeof value === "object") {
        if (value.$ne && docId === value.$ne.toString()) return false;
      } else if (docId !== (value || "").toString()) {
        return false;
      }
      continue;
    }

    if (key === "isDeleted") {
      const docVal = doc.isDeleted === true;
      const filterVal = value === true;
      if (docVal !== filterVal) return false;
      continue;
    }

    if (key === "enabled") {
      const docVal = doc.enabled !== false;
      const filterVal = value !== false;
      if (docVal !== filterVal) return false;
      continue;
    }

    if (value && typeof value === "object" && value.$regex) {
      const regex = new RegExp(value.$regex, value.$options || "");
      if (!regex.test(doc[key] || "")) return false;
      continue;
    }

    const docVal =
      doc[key] && doc[key]._id
        ? doc[key]._id.toString()
        : doc[key] && doc[key].toString
        ? doc[key].toString()
        : doc[key];
    const filterVal =
      value && value._id
        ? value._id.toString()
        : value && value.toString
        ? value.toString()
        : value;

    if (docVal !== filterVal) {
      return false;
    }
  }
  return true;
}

function wrapDoc(Model, rawData) {
  if (!rawData) return null;
  const doc = new Model(rawData);
  if (!doc._id) {
    doc._id = new mongoose.Types.ObjectId(rawData._id || undefined);
  }

  doc.save = async function () {
    const list = db[Model.modelName];
    const index = list.findIndex((i) => (i._id || "").toString() === this._id.toString());
    const obj = this.toObject();
    if (index >= 0) {
      list[index] = obj;
    } else {
      list.push(obj);
    }
    return this;
  };

  return doc;
}

function mockMongooseModel(Model) {
  const modelName = Model.modelName;

  Model.create = async function (data) {
    const list = db[modelName];
    if (Array.isArray(data)) {
      return data.map((d) => {
        const doc = wrapDoc(Model, d);
        list.push(doc.toObject());
        return doc;
      });
    }
    const doc = wrapDoc(Model, data);
    list.push(doc.toObject());
    return doc;
  };

  Model.findOne = function (filter = {}) {
    const list = db[modelName];
    const found = list.find((d) => matchFilter(d, filter));
    const doc = found ? wrapDoc(Model, found) : null;

    const promise = Promise.resolve(doc);
    promise.populate = function () {
      return promise;
    };
    promise.sort = function () {
      return promise;
    };
    promise.lean = function () {
      return Promise.resolve(found ? { ...found } : null);
    };
    return promise;
  };

  Model.findById = function (id) {
    return Model.findOne({ _id: id });
  };

  Model.find = function (filter = {}) {
    const list = db[modelName];
    let skipVal = 0;
    let limitVal = null;

    const runner = () => {
      let matched = list.filter((d) => matchFilter(d, filter));
      if (skipVal > 0) matched = matched.slice(skipVal);
      if (limitVal !== null && limitVal !== undefined) matched = matched.slice(0, limitVal);
      return matched.map((d) => wrapDoc(Model, d));
    };

    const promise = {
      sort: function () {
        return promise;
      },
      skip: function (n) {
        skipVal = n;
        return promise;
      },
      limit: function (n) {
        limitVal = n;
        return promise;
      },
      populate: function () {
        return promise;
      },
      then: function (onFulfilled, onRejected) {
        return Promise.resolve(runner()).then(onFulfilled, onRejected);
      },
      catch: function (onRejected) {
        return Promise.resolve(runner()).catch(onRejected);
      },
    };
    return promise;
  };

  Model.countDocuments = async function (filter = {}) {
    const list = db[modelName];
    return list.filter((d) => matchFilter(d, filter)).length;
  };

  Model.aggregate = async function (pipeline = []) {
    const list = db[modelName];
    const group = pipeline.find((p) => p.$group);
    if (group) {
      const field = group.$group._id.replace("$", "");
      const counts = {};
      for (const item of list) {
        const val = item[field] || "unknown";
        counts[val] = (counts[val] || 0) + 1;
      }
      return Object.entries(counts).map(([_id, count]) => ({ _id, count }));
    }
    return [];
  };
}

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.ADMIN_API_KEY = "test_admin_secret_key";
  process.env.ENCRYPTION_KEY = "test_encryption_master_key_32_bytes";
  process.env.ALLOW_LOCAL_DESTINATIONS = "true";

  mockMongooseModel(Integration);
  mockMongooseModel(Event);
  mockMongooseModel(EventLog);
  mockMongooseModel(Delivery);
  mockMongooseModel(DeliveryAttempt);
});

beforeEach(() => {
  db.Integration = [];
  db.Event = [];
  db.EventLog = [];
  db.Delivery = [];
  db.DeliveryAttempt = [];
});
