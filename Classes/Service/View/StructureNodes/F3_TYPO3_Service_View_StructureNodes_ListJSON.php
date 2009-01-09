<?php
declare(ENCODING = 'utf-8');
namespace F3\TYPO3\Service\View\StructureNodes;

/*                                                                        *
 * This script is part of the TYPO3 project - inspiring people to share!  *
 *                                                                        *
 * TYPO3 is free software; you can redistribute it and/or modify it under *
 * the terms of the GNU General Public License version 2 as published by  *
 * the Free Software Foundation.                                          *
 *                                                                        *
 * This script is distributed in the hope that it will be useful, but     *
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHAN-    *
 * TABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General      *
 * Public License for more details.                                       *
 *                                                                        */

/**
 * @package TYPO3
 * @subpackage Service
 * @version $Id$
 */

/**
 * JSON view for the Structure Nodes List action
 *
 * @package TYPO3
 * @subpackage Service
 * @version $Id$
 * @license http://opensource.org/licenses/gpl-license.php GNU Public License, version 2
 */
class ListJSON extends \F3\FLOW3\MVC\View\AbstractView {

	/**
	 * @var array
	 */
	public $structureNodes = array();

	/**
	 * Renders this list view
	 *
	 * @return string The rendered JSON output
	 * @author Robert Lemke <robert@typo3.org>
	 */
	public function render() {
		return json_encode($this->structureNodes);
	}
}
?>