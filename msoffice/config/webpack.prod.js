const webpack = require('webpack');
const path = require('path');
const webpackMerge = require('webpack-merge');
const commonConfig = require('./webpack.common.js');
const ENV = process.env.NODE_ENV = process.env.ENV = 'production';

module.exports = webpackMerge(commonConfig, {
    devtool: 'source-map',

    mode: 'production',

    output: {
        path: path.resolve('dist'),
        publicPath: '/msoffice/',
        filename: '[name].[hash].js',
        chunkFilename: '[id].[hash].chunk.js',
        globalObject: `(typeof self !== 'undefined' ? self : this)`,
    },

    externals: {
        'react': 'React',
        'react-dom': 'ReactDOM'
    },

    performance: {
        hints: "warning"
    },

    optimization: {
        minimize: true,
    },

    plugins: []
});
