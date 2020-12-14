'use strict'

var rdf = require('@graphy/core.data.factory')

let wasmTreeMain = require('../index.js')
let wasmTreeAlt  = require('../alternative.js')

require('./WrappedDatasetCore')(rdf, wasmTreeMain.TreeDataset)
require('./WrappedDataset'    )(rdf, wasmTreeMain.TreeDataset)

require('./WrappedDatasetCore')(rdf, wasmTreeMain.AlwaysForestDataset      , "AlwaysForestNoShared")
require('./WrappedDatasetCore')(rdf, wasmTreeAlt.DatasetWithIdentifierList , "IdentifierListNoShared")
require('./WrappedDatasetCore')(rdf, wasmTreeAlt.DatasetWithSharedTermIdMap, "AlwaysForestShared")

require('./Store'             )(rdf, wasmTreeMain.TreeStore)

require('./AltTest')(rdf);

