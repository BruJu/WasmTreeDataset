'use strict'

var rdf = require('@graphy/core.data.factory')

let wasmexport = require('../pkg/wrappedtree')


let TreeDataset = wasmexport.TreeDataset;
let TreeStore   = wasmexport.TreeStore;

require('./WrappedDatasetCore')(rdf, TreeDataset)
require('./WrappedDataset'    )(rdf, TreeDataset)
//require('./Store'             )(rdf, TreeStore)
