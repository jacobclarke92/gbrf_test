var path = require('path');
var webpack = require('webpack');

module.exports = {
	entry: {
		gbrf_test: './scripts/index.js',
	},
	output: {
		path: path.join(__dirname, 'dist'),
		filename: '[name].js',
	},
	plugins: [
		new webpack.NoErrorsPlugin(),
		new webpack.DefinePlugin({'process.env': {'NODE_ENV': JSON.stringify('production')}}),
	],
	module: {
		loaders: [
			{
				test: /\.js$/,
				include: path.join(__dirname, 'node_modules', 'pixi.js'),
				loader: 'transform?brfs',
			},
			{
				test: /\.json$/,
				include: path.join(__dirname, 'node_modules', 'pixi.js'),
				loader: 'json',
			},
			{
				test: /\.glsl$/,
				loader: 'webpack-glsl'
			},
			{
				loader: 'babel-loader',
				test: /\.js$/,
				query: {presets: ['es2015']},
				include: [path.join(__dirname, 'scripts')],
			},
		],
	}
};
