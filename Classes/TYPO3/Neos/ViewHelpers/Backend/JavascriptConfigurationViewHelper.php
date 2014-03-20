<?php
namespace TYPO3\Neos\ViewHelpers\Backend;

/*                                                                        *
 * This script belongs to the TYPO3 Flow package "TYPO3.Neos".            *
 *                                                                        *
 * It is free software; you can redistribute it and/or modify it under    *
 * the terms of the GNU General Public License, either version 3 of the   *
 * License, or (at your option) any later version.                        *
 *                                                                        *
 * The TYPO3 project - inspiring people to share!                         *
 *                                                                        */

use TYPO3\Flow\Annotations as Flow;
use TYPO3\Flow\Reflection\ObjectAccess;
use TYPO3\Flow\Utility\PositionalArraySorter;
use TYPO3\Fluid\Core\ViewHelper\AbstractViewHelper;

/**
 * ViewHelper for the backend 'container'. Renders the required HTML to integrate
 * the Neos backend into a website.
 */
class JavascriptConfigurationViewHelper extends AbstractViewHelper {

	/**
	 * @var array
	 */
	protected $settings;

	/**
	 * @var \TYPO3\Neos\Cache\CacheManager
	 * @Flow\Inject
	 */
	protected $cacheManager;

	/**
	 * @var \TYPO3\Flow\Core\Bootstrap
	 * @Flow\Inject
	 */
	protected $bootstrap;

	/**
	 * @Flow\Inject
	 * @var \TYPO3\Flow\Resource\Publishing\ResourcePublisher
	 */
	protected $resourcePublisher;

	/**
	 * @Flow\Inject
	 * @var \TYPO3\Flow\I18n\Service
	 */
	protected $i18nService;

	/**
	 * @Flow\Inject
	 * @var \TYPO3\Flow\Security\Context
	 */
	protected $securityContext;

	/**
	 * @return string
	 */
	public function render() {
		$configurationCacheIdentifier = $this->cacheManager->getConfigurationCacheVersion();

		$configuration = array(
			'window.T3Configuration = {};',
			'window.T3Configuration.UserInterface = ' . json_encode($this->settings['userInterface']) . ';',
			'window.T3Configuration.nodeTypes = {};',
			'window.T3Configuration.nodeTypes.groups = ' . json_encode($this->getNodeTypeGroupsSettings()) . ';',
			'window.T3Configuration.requirejs = {};',
			'window.T3Configuration.requirejs.paths = ' . json_encode($this->getRequireJsPathMapping()) . ';'
		);

		$neosJavaScriptBasePath = $this->getStaticResourceWebBaseUri('resource://TYPO3.Neos/Public/JavaScript');

		$configuration[] = 'window.T3Configuration.neosJavascriptBasePath = ' . json_encode($neosJavaScriptBasePath) . ';';

		if ($this->bootstrap->getContext()->isDevelopment()) {
			$configuration[] = 'window.T3Configuration.DevelopmentMode = true;';
		}

		return (implode("\n", $configuration));
	}

	/**
	 * @param string $resourcePath
	 * @return string
	 */
	protected function getStaticResourceWebBaseUri($resourcePath) {
		$localizedResourcePathData = $this->i18nService->getLocalizedFilename($resourcePath);
		$matches = array();
		if (preg_match('#resource://([^/]+)/Public/(.*)#', current($localizedResourcePathData), $matches) === 1) {
			$package = $matches[1];
			$path = $matches[2];
		}
		return $this->resourcePublisher->getStaticResourcesWebBaseUri() . 'Packages/' . $package . '/' . $path;
	}

	/**
	 * @return array
	 */
	protected function getRequireJsPathMapping() {
		$pathMappings = array();

		$validatorSettings = ObjectAccess::getPropertyPath($this->settings, 'userInterface.validators');
		if (is_array($validatorSettings)) {
			foreach ($validatorSettings as $validatorName => $validatorConfiguration) {
				if (isset($validatorConfiguration['path'])) {
					$pathMappings[$validatorName] = $this->getStaticResourceWebBaseUri($validatorConfiguration['path']);
				}
			}
		}

		$editorSettings = ObjectAccess::getPropertyPath($this->settings, 'userInterface.inspector.editors');
		if (is_array($editorSettings)) {
			foreach ($editorSettings as $editorName => $editorConfiguration) {
				if (isset($editorConfiguration['path'])) {
					$pathMappings[$editorName] = $this->getStaticResourceWebBaseUri($editorConfiguration['path']);
				}
			}
		}

		$requireJsPathMappingSettings = ObjectAccess::getPropertyPath($this->settings, 'userInterface.requireJsPathMapping');
		if (is_array($requireJsPathMappingSettings)) {
			foreach ($requireJsPathMappingSettings as $namespace => $path) {
				$pathMappings[$namespace] = $this->getStaticResourceWebBaseUri($path);
			}
		}

		return $pathMappings;
	}

	/**
	 * @return array
	 */
	protected function getNodeTypeGroupsSettings() {
		$settings = array();
		$nodeTypeGroupsSettings = new PositionalArraySorter($this->settings['nodeTypes']['groups']);
		foreach ($nodeTypeGroupsSettings->toArray() as $nodeTypeGroupName => $nodeTypeGroupSettings) {
			if (!isset($nodeTypeGroupSettings['label'])) {
				continue;
			}
			$settings[] = array(
				'name' => $nodeTypeGroupName,
				'label' => $nodeTypeGroupSettings['label']
			);
		}

		return $settings;
	}

	/**
	 * @param array $settings
	 */
	public function injectSettings(array $settings) {
		$this->settings = $settings;
	}

}
