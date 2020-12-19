'use strict'

var rdf = require('@graphy/core.data.factory')

let wasmTree = require('../index.js')

require('./WrappedDatasetCore')(rdf, wasmTree.Dataset, "WasmTree")
require('./WrappedDataset'    )(rdf, wasmTree.Dataset)

require('./WrappedDatasetCore')(rdf, wasmTree.AlwaysForestDataset       , "AlwaysForestNoShared")
require('./WrappedDatasetCore')(rdf, wasmTree.DatasetWithIdentifierList , "IdentifierListNoShared")
require('./WrappedDatasetCore')(rdf, wasmTree.DatasetWithSharedTermIdMap, "AlwaysForestShared")

require('./Store'             )(rdf, wasmTree.Store)

require('./AltTest')(rdf);

