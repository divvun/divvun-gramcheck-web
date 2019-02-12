const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const webpackMerge = require('webpack-merge');
const commonConfig = require('./webpack.common.js');

module.exports = webpackMerge(commonConfig, {
    devtool: 'eval-source-map',
    mode: 'development',
    devServer: {
        publicPath: '/',
        contentBase: path.resolve('dist'),
        hot: false,
        https: {
            key: fs.readFileSync('./certs/server.key'),
            cert: fs.readFileSync('./certs/server.crt'),
            cacert: fs.readFileSync('./certs/ca.crt')
        },
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
        },
        compress: true,
        overlay: {
            warnings: false,
            errors: true
        },
        port: 3000,
        historyApiFallback: true,
    },
    plugins: [
        // new webpack.HotModuleReplacementPlugin()
    ]
});
