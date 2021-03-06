define(
	[
		'Library/jquery-with-dependencies',
		'./SelectBoxEditor',
		'Shared/Configuration',
		'Shared/NodeTypeService'
	],
	function ($, SelectBoxEditor, Configuration, NodeTypeService) {
		return SelectBoxEditor.extend({
			baseNodeType: 'TYPO3.Neos:Content',

			// todo add support for optgroup when Select2 replace Chosen
			didInsertElement: function () {
				this._super();
				var that = this,
					values = [],
					sortedNodeTypes = {},
					subNodeTypeCounter = 0,
					nodeTypes,
					nodeTypeDefinition,
					parentNodeName = this.get('inspector.selectedNode.attributes._parentnodename');

				// 1. Figure out the Node Types which are allowed according to the Node Type Constraints
				if (parentNodeName) {
					// parent IS auto created; as only then the ContentElementWrappingService adds this property.
					this.get('inspector.selectedNode.attributes._grandparentnodetype');
					nodeTypes = NodeTypeService.getAllowedChildNodeTypesForAutocreatedNode(
						this.get('inspector.selectedNode.attributes._grandparentnodetype'),
						parentNodeName
					);
				} else {
					// parent is NOT auto created
					nodeTypes = NodeTypeService.getAllowedChildNodeTypes(
						this.get('inspector.selectedNode.attributes._parentnodetype')
					);
				}

				// 2. Filter for subtypes of BaseNodeType
				nodeTypes = nodeTypes.filter(function(nodeTypeName) {
					return NodeTypeService.isOfType(nodeTypeName, that.get('baseNodeType'));
				});

				// 3. Pre-process the selector and then fill it
				$.each(nodeTypes, function(index, nodeType) {
					nodeTypeDefinition = NodeTypeService.getNodeTypeDefinition(nodeType);

					if (nodeTypeDefinition && nodeTypeDefinition.ui && nodeTypeDefinition.ui.label) {
						values.push({
							value: nodeType,
							label: nodeTypeDefinition.ui.label
						});
						subNodeTypeCounter++;
					}
				});

				if (subNodeTypeCounter > 0) {
					values = values.sort(function (a, b) {
						return a.label.localeCompare(b.label);
					});

					for (var i = 0; i < values.length; i++) {
						sortedNodeTypes[values[i].value] = values[i];
					}

					this.set('values', sortedNodeTypes);
				} else {
					this.set('placeholder', 'Unable to load sub node types of: ' + this.get('baseNodeType'));
				}
			}
		});
	}
);