'use strict';

const { performance } = require('perf_hooks');

const AbstractDriver = require('../abstract');
const Attribute = require('./attribute');
const DataTypes = require('./data_types');
const spellbook = require('./spellbook');
const schema = require('./schema');
const { calculateDuration } = require('../../utils');

class MysqlDriver extends AbstractDriver {
  /**
   * Create a connection pool
   * @param {string} clientName
   * @param {Object} opts
   * @param {string} opts.host
   * @param {string} opts.port
   * @param {string} opts.user
   * @param {string} opts.password
   * @param {string} opts.appName         - In some RDMS, appName is used as the actual name of the database
   * @param {string} opts.database
   * @param {string} opts.connectionLimit
   * @param {number} opts.connectTimeout  - The milliseconds before a timeout occurs during the initial connection to the MySQL server. (Default: `10000`)
   * @param {string} opts.charset
   * @param {boolean} opts.stringifyObjects  - stringify object value in dataValues
   */
  constructor(opts = {}) {
    super(opts);
    this.type = 'mysql';
    this.pool = this.createPool(opts);
    this.escape = this.pool.escape.bind(this.pool);
  }

  get escapeId() {
    return this.pool.escapeId;
  }

  createPool(opts) {
    // some RDMS use appName to locate the database instead of the actual db, though the table_schema stored in infomation_schema.columns is still the latter one.
    const database = opts.appName || opts.database;
    const client = opts.client || 'mysql';
    const {
      host, port, user, password,
      connectTimeout, connectionLimit, charset, stringifyObjects = true,
    } = opts;

    if (client !== 'mysql' && client !== 'mysql2') {
      throw new Error(`Unsupported mysql client ${client}`);
    }

    return require(client).createPool({
      connectionLimit,
      connectTimeout,
      host,
      port,
      user,
      password,
      database,
      charset,
      stringifyObjects,
    });
  }

  getConnection() {
    return new Promise((resolve, reject) => {
      this.pool.getConnection((err, connection) => {
        if (err) {
          reject(err);
        } else {
          resolve(connection);
        }
      });
    });
  }

  async query(query, values, opts = {}) {
    const { logger } = this;
    const connection = opts.connection || await this.getConnection();
    const promise = new Promise((resolve, reject) => {
      connection.query(query, values, (err, results, fields) => {
        if (err) {
          reject(err);
        } else {
          resolve([ results, fields ]);
        }
      });
    });
    const sql = logger.format(query, values, opts);
    const start = performance.now();
    let result;

    try {
      result = await promise;
    } catch (err) {
      logger.logQueryError(err, sql, calculateDuration(start), opts);
      throw err;
    } finally {
      if (!opts.connection) connection.release();
    }

    logger.tryLogQuery(sql, calculateDuration(start), opts);
    const [ results, fields ] = result;
    if (fields) return { rows: results, fields };
    return results;
  }

  format(spell) {
    return spellbook.format(spell);
  }
}

Object.assign(MysqlDriver.prototype, { ...schema, Attribute, DataTypes });

module.exports = MysqlDriver;
