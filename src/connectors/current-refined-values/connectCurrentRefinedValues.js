import isUndefined from 'lodash/isUndefined';
import isBoolean from 'lodash/isBoolean';
import isString from 'lodash/isString';
import isArray from 'lodash/isArray';
import isPlainObject from 'lodash/isPlainObject';
import isFunction from 'lodash/isFunction';
import isEmpty from 'lodash/isEmpty';

import map from 'lodash/map';
import reduce from 'lodash/reduce';
import filter from 'lodash/filter';

import {
  getRefinements,
  clearRefinementsFromState,
  clearRefinementsAndSearch,
  checkRendering,
} from '../../lib/utils.js';

const usage = `Usage:
var customCurrentRefinedValues = connectCurrentRefinedValues(function renderFn(params, isFirstRendering) {
  // params = {
  //   attributes,
  //   clearAllClick,
  //   clearAllPosition,
  //   clearAllURL,
  //   refine,
  //   createURL,
  //   refinements,
  //   instantSearchInstance,
  //   widgetParams,
  // }
});
search.addWidget(
  customCurrentRefinedValues({
    [ attributes = [] ],
    [ onlyListedAttributes = false ],
    [ clearsQuery = false ]
  })
);
Full documentation available at https://community.algolia.com/instantsearch.js/connectors/connectCurrentRefinedValues.html
`;

/**
 * @typedef {Object} CurrentRefinedValuesRenderingOptions
 * @property {Object.<string, object>} attributes `CurrentRefinedValuesWidgetOptions.attributes` mapped by keys.
 * @property {function} clearAllClick Trigger the clear of all the currently refined values.
 * @property {function} clearAllURL URL which leads to a state where all the refinements have been cleared.
 * @property {string} clearAllPosition Position of the `clearAll` button / link.
 * @property {function(item)} refine Clearing function for a refinement.
 * @property {function(item)} createURL Creates an individual url where a single refinement is cleared.
 * @property {Refinements[]} refinements All the current refinements.
 * @property {InstantsSearch} instantSearchInstance Instance of instantsearch on which the widget is attached.
 * @property {Object} widgetParams All original `CurrentRefinedValuesWidgetOptions` forwarded to the `renderFn`.
 */

/**
 * @typedef {Object} CurrentRefinedValuesAttributes
 * @property {string} name Mandatory field which is the name of the attribute.
 * @property {string} label The label to apply on a refinement per attribute.
 * @property {string|function} template The template to apply.
 * @property {function} transformData Transform the content of the refinement before rendering the template.
 */

/**
 * @typedef {Object} CurrentRefinedValuesWidgetOptions
 * @property {CurrentRefinedValuesAttributes[]} attributes specification for the display of refinements per attribute
 * @property {boolean} onlyListedAttributes limit the displayed refinement to the list specified
 * @property {boolean} [clearsQuery=false] also clears the active search query
 */

/**
 * **CurrentRefinedValues** connector provides the logic to build a widget that will give the user the ability to remove all or some of the filters that were set.
 * This provides a `CurrentRefinedValuesRenderingOptions.refine(item)` function to remove the selected refinement.
 * @type {Connector}
 * @param {function(CurrentRefinedValuesRenderingOptions)} renderFn Rendering function for the custom **CurrentRefinedValues** widget.
 * @return {function(CurrentRefinedValuesWidgetOptions): CurrentRefinedValuesWidget} Re-usable widget factory for a custom **CurrentRefinedValues** widget.
 * @example
 * var $ = window.$;
 * var instantsearch = window.instantsearch;
 *
 * // custom `renderFn` to render the custom ClearAll widget
 * function renderFn(CurrentRefinedValuesRenderingOptions, isFirstRendering) {
 *   if (isFirstRendering) {
 *     CurrentRefinedValuesRenderingOptions.widgetParams.containerNode
 *       .html('<ul id="refiments"></ul><div id="cta-container"></div>');
 *   }
 *
 *   CurrentRefinedValuesRenderingOptions.widgetParams.containerNode
 *     .find('#cta-container > a')
 *     .off('click');
 *
 *   CurrentRefinedValuesRenderingOptions.widgetParams.containerNode
 *     .find('li > a')
 *     .each(function() { $(this).off('click') });
 *
 *   if (refinements && refinements.length > 0) {
 *     CurrentRefinedValuesRenderingOptions.widgetParams.containerNode
 *       .find('#cta-container')
 *       .html('<a href="' + CurrentRefinedValuesRenderingOptions.clearAllURL + '">Clear all </a>');
 *
 *     CurrentRefinedValuesRenderingOptions.widgetParams.containerNode
 *       .find('#cta-container > a')
 *       .on('click', function(event) {
 *         event.preventDefault();
 *         CurrentRefinedValuesRenderingOptions.clearAllClick();
 *       });
 *
 *     var list = CurrentRefinedValuesRenderingOptions.refinements.map(function(refinement) {
 *       return '<li><a href="' + CurrentRefinedValuesRenderingOptions.createURL(refinement) + '">'
 *         + refinement.computedLabel + ' ' + refinement.count + '</a></li>';
 *     });
 *
 *     CurrentRefinedValuesRenderingOptions.find('ul').html(list);
 *     CurrentRefinedValuesRenderingOptions.find('li > a').each(function(index) {
 *       $(this).on('click', function(event) {
 *         event.preventDefault();
 *
 *         var refinement = CurrentRefinedValuesRenderingOptions.refinements[index];
 *         CurrentRefinedValuesRenderingOptions.refine(refinement);
 *       });
 *     });
 *   } else {
 *     CurrentRefin.widgetParams.containerNode.find('#cta-container').html('');
 *     CurrentRefin.widgetParams.containerNode.find('ul').html('');
 *   }
 * }
 *
 * // connect `renderFn` to CurrentRefinedValues logic
 * var customCurrentRefinedValues = instantsearch.connectors.connectCurrentRefinedValues(renderFn);
 *
 * // mount widget on the page
 * search.addWidget(
 *   customCurrentRefinedValues({
 *     containerNode: $('#custom-crv-container'),
 *   })
 * );
 */
export default function connectCurrentRefinedValues(renderFn) {
  checkRendering(renderFn, usage);

  return (widgetParams = {}) => {
    const {
      attributes = [],
      onlyListedAttributes = false,
      clearsQuery = false,
    } = widgetParams;

    const attributesOK = isArray(attributes) &&
      reduce(
        attributes,
        (res, val) =>
          res &&
            isPlainObject(val) &&
            isString(val.name) &&
            (isUndefined(val.label) || isString(val.label)) &&
            (isUndefined(val.template) || isString(val.template) || isFunction(val.template)) &&
            (isUndefined(val.transformData) || isFunction(val.transformData)),
        true);

    const showUsage = false ||
      !isArray(attributes) ||
      !attributesOK ||
      !isBoolean(onlyListedAttributes);

    if (showUsage) {
      throw new Error(usage);
    }

    const attributeNames = map(attributes, attribute => attribute.name);
    const restrictedTo = onlyListedAttributes ? attributeNames : [];

    const attributesObj = reduce(attributes, (res, attribute) => {
      res[attribute.name] = attribute;
      return res;
    }, {});

    return {

      init({helper, createURL, instantSearchInstance}) {
        this._clearRefinementsAndSearch = clearRefinementsAndSearch.bind(null, helper, restrictedTo, clearsQuery);

        const clearAllURL = createURL(clearRefinementsFromState(helper.state, restrictedTo, clearsQuery));

        const refinements = getFilteredRefinements({}, helper.state, attributeNames, onlyListedAttributes);

        const _createURL = refinement => createURL(clearRefinementFromState(helper.state, refinement));
        const _clearRefinement = refinement => clearRefinement(helper, refinement);

        renderFn({
          attributes: attributesObj,
          clearAllClick: this._clearRefinementsAndSearch,
          clearAllURL,
          refine: _clearRefinement,
          createURL: _createURL,
          refinements,
          instantSearchInstance,
          widgetParams,
        }, true);
      },

      render({results, helper, state, createURL, instantSearchInstance}) {
        const clearAllURL = createURL(clearRefinementsFromState(state, restrictedTo, clearsQuery));

        const refinements = getFilteredRefinements(results, state, attributeNames, onlyListedAttributes);

        const _createURL = refinement => createURL(clearRefinementFromState(helper.state, refinement));
        const _clearRefinement = refinement => clearRefinement(helper, refinement);

        renderFn({
          attributes: attributesObj,
          clearAllClick: this._clearRefinementsAndSearch,
          clearAllURL,
          refine: _clearRefinement,
          createURL: _createURL,
          refinements,
          instantSearchInstance,
          widgetParams,
        }, false);
      },
    };
  };
}

function getRestrictedIndexForSort(attributeNames, otherAttributeNames, attributeName) {
  const idx = attributeNames.indexOf(attributeName);
  if (idx !== -1) {
    return idx;
  }
  return attributeNames.length + otherAttributeNames.indexOf(attributeName);
}

function compareRefinements(attributeNames, otherAttributeNames, a, b) {
  const idxa = getRestrictedIndexForSort(attributeNames, otherAttributeNames, a.attributeName);
  const idxb = getRestrictedIndexForSort(attributeNames, otherAttributeNames, b.attributeName);
  if (idxa === idxb) {
    if (a.name === b.name) {
      return 0;
    }
    return a.name < b.name ? -1 : 1;
  }
  return idxa < idxb ? -1 : 1;
}

function getFilteredRefinements(results, state, attributeNames, onlyListedAttributes) {
  let refinements = getRefinements(results, state);
  const otherAttributeNames = reduce(refinements, (res, refinement) => {
    if (attributeNames.indexOf(refinement.attributeName) === -1 && res.indexOf(refinement.attributeName === -1)) {
      res.push(refinement.attributeName);
    }
    return res;
  }, []);
  refinements = refinements.sort(compareRefinements.bind(null, attributeNames, otherAttributeNames));
  if (onlyListedAttributes && !isEmpty(attributeNames)) {
    refinements = filter(refinements, refinement => attributeNames.indexOf(refinement.attributeName) !== -1);
  }
  return refinements.map(computeLabel);
}

function clearRefinementFromState(state, refinement) {
  switch (refinement.type) {
  case 'facet':
    return state.removeFacetRefinement(refinement.attributeName, refinement.name);
  case 'disjunctive':
    return state.removeDisjunctiveFacetRefinement(refinement.attributeName, refinement.name);
  case 'hierarchical':
    return state.clearRefinements(refinement.attributeName);
  case 'exclude':
    return state.removeExcludeRefinement(refinement.attributeName, refinement.name);
  case 'numeric':
    return state.removeNumericRefinement(refinement.attributeName, refinement.operator, refinement.numericValue);
  case 'tag':
    return state.removeTagRefinement(refinement.name);
  default:
    throw new Error(`clearRefinement: type ${refinement.type} is not handled`);
  }
}

function clearRefinement(helper, refinement) {
  helper.setState(clearRefinementFromState(helper.state, refinement)).search();
}

function computeLabel(value) {
  // default to `value.name` if no operators
  value.computedLabel = value.name;

  if (value.hasOwnProperty('operator') && typeof value.operator === 'string') {
    let displayedOperator = value.operator;
    if (value.operator === '>=') displayedOperator = '≥';
    if (value.operator === '<=') displayedOperator = '≤';
    value.computedLabel = `${displayedOperator} ${value.name}`;
  }

  return value;
}
