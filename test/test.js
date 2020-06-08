'use strict'

var rdf = require('@graphy/core.data.factory')

rdf.WrappedDataset = require('../pkg/wrappedtree.js')

require('./WrappedDatasetCore')(rdf)
require('./WrappedDataset')(rdf)

