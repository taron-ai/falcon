import Koa from 'koa';
import serve from 'koa-static';
import helmet from 'koa-helmet';
import Router from 'koa-router';
import compress from 'koa-compress';
import Logger from '@deity/falcon-logger';
import error500 from './middlewares/error500Middleware';
import serverTiming from './middlewares/serverTimingMiddleware';
import graphqlProxy from './middlewares/graphqlProxyMiddleware';
import { renderAppShell, renderApp } from './middlewares/routes';

/**
 * Creates an instance of Falcon web server
 * @param {ServerAppConfig} props Application parameters
 * @return {WebServer} Falcon web server
 */
export async function Server({ App, clientApolloSchema, bootstrap, webpackAssets, loadableStats }) {
  const { config } = bootstrap;
  Logger.setLogLevel(config.logLevel);

  const instance = new Koa();
  if (bootstrap.onServerCreated) {
    await bootstrap.onServerCreated(instance);
  }

  const publicDir = process.env.PUBLIC_DIR;
  const router = new Router();
  if (bootstrap.onRouterCreated) {
    await bootstrap.onRouterCreated(router);
  }

  if (config.graphqlUrl) {
    const { apolloClient } = config;
    const graphqlUri = (apolloClient && apolloClient.httpLink && apolloClient.httpLink.uri) || '/graphql';
    router.all(graphqlUri, graphqlProxy(config.graphqlUrl));
  }
  router.get('/sw.js', serve(publicDir, { maxage: 0 }));
  router.get('/static/*', serve(publicDir, { maxage: process.env.NODE_ENV === 'production' ? 31536000000 : 0 }));
  router.get('/*', serve(publicDir));
  router.get('/app-shell', ...renderAppShell({ config, webpackAssets, loadableStats }));
  router.get('/*', ...renderApp({ App, clientApolloSchema, config, webpackAssets, loadableStats }));
  if (bootstrap.onRouterInitialized) {
    await bootstrap.onRouterInitialized(router);
  }

  instance
    .use(helmet())
    .use(error500())
    .use(serverTiming())
    .use(compress())
    .use(router.routes())
    .use(router.allowedMethods());

  if (bootstrap.onServerInitialized) {
    await bootstrap.onServerInitialized(instance);
  }

  return {
    instance,
    port: config.port,
    callback: () => instance.callback(),
    started: () => bootstrap.onServerStarted(instance)
  };
}

/**
 * @typedef {object} ServerAppConfig
 * @property {function} App Root application component
 * @property {{config, onServerCreated, onServerInitialized, onServerStarted }} bootstrap Initial configuration
 * @property {object} clientApolloSchema Apollo State object
 * @property {object} webpackAssets webpack assets
 */

/**
 * @typedef {object} WebServer
 * @property {Koa} instance Server instance
 * @property {function} callback Initial configuration
 * @property {number} port Desired PORT to run at
 * @property {object} clientApolloSchema Apollo State object
 */
