"use strict";

(function () {
	var createElement = utils.createElement;

	var Context = firstOrderLogicTool.Context;
	var parseFormula = firstOrderLogicTool.parse;
	var analyze = firstOrderLogicTool.analyze;
	var normalize = firstOrderLogicTool.normalize;

	var form = document.forms["first-order-logic-tool"];
	var formulaElement = form.elements.formula;
	var errorElement = document.getElementById("first-order-logic-tool-error");
	var resultElement = document.getElementById("first-order-logic-tool-result");
	var parsedElement = document.getElementById("first-order-logic-tool-parsed");
	var interpretationElement = document.getElementById("first-order-logic-tool-interpretation");
	var heightElement = document.getElementById("first-order-logic-tool-height");
	var degreeElement = document.getElementById("first-order-logic-tool-degree");
	var prenexElement = document.getElementById("first-order-logic-tool-prenex");
	var prenexDNFElement = document.getElementById("first-order-logic-tool-prenex-dnf");
	var prenexCNFElement = document.getElementById("first-order-logic-tool-prenex-cnf");
	var truthTableResultElement = document.getElementById("first-order-logic-tool-truth-table-result");
	var truthTableElement = document.getElementById("first-order-logic-truth-table");

	formulaElement.addEventListener("input", function () {
		var formula = formulaElement.value;
		var selectionStart = Math.min(formulaElement.selectionStart, formulaElement.selectionEnd);
		var selectionEnd = Math.max(formulaElement.selectionStart, formulaElement.selectionEnd);
		var left = mathify(formula.substring(0, selectionStart));
		var middle = mathify(formula.substring(selectionStart, selectionEnd));
		var right = mathify(formula.substring(selectionEnd, formula.length));
		formulaElement.value = left + middle + right;
		formulaElement.setSelectionRange(left.length, left.length + middle.length);
	});

	formulaElement.addEventListener("change", update);

	form.addEventListener("submit", function (event) {
		event.preventDefault();
		update();
	});

	update();

	function update() {
		var formulaString = String.prototype.normalize ? formulaElement.value.normalize("NFC") : formulaElement.value;
		var context = new Context(formulaString);
		var formula = parseFormula(context);

		if (formula == null) {
			resultElement.style.display = "none";
			if (context.errorPosition === formulaElement.value.length) formulaElement.value += " ";

			errorElement.innerText = context.error;
			errorElement.style.removeProperty("display");

			setTimeout(function () {
				formulaElement.focus();
				formulaElement.setSelectionRange(context.errorPosition, formulaElement.value.length);
			}, 0);

			return;
		}

		var semantics;

		try {
			semantics = analyze(formula);
		} catch (e) {
			resultElement.style.display = "none";
			formulaElement.setSelectionRange(e.source.start, e.source.end);
			errorElement.innerHTML = e.messageHTML;
			errorElement.style.removeProperty("display");
			return;
		}

		errorElement.style.display = "none";
		interpretationElement.innerHTML = "";

		var ul = document.createElement("ul");

		for (var identifier in semantics) {
			var li = document.createElement("li");
			li.appendChild(createElement("i", identifier));
			li.appendChild(document.createTextNode(" is a " + semantics[identifier]));
			ul.appendChild(li);
		}

		interpretationElement.appendChild(ul);

		var height = formula.height;
		var degree = formula.degree;
		var normalized = normalize(formula, semantics);

		parsedElement.innerHTML = "";
		parsedElement.appendChild(formula.accept(new HTMLTreeGeneratorVisitor(height)));

		heightElement.innerText = height;
		degreeElement.innerText = degree;

		prenexElement.innerHTML = "";
		prenexElement.appendChild(normalized.prenex.accept(new HTMLTextGeneratorVisitor()));

		prenexDNFElement.innerHTML = "";
		prenexDNFElement.appendChild(normalized.prenexDNF.accept(new HTMLTextGeneratorVisitor()));

		prenexCNFElement.innerHTML = "";
		prenexCNFElement.appendChild(normalized.prenexCNF.accept(new HTMLTextGeneratorVisitor()));

		if (degree === 0 || !formula.isPropositional) {
			truthTableResultElement.style.display = "none";
		} else {
			var terms = formula.accept(new CollectTermsVisitor());
			var values = [];

			var table = document.createElement("table");
			var thead = document.createElement("thead");
			var tr = document.createElement("tr");

			terms.forEach(function (term) {
				values.push(false);
				tr.appendChild(createElement("th", term));
			});

			tr.appendChild(createElement("th", formula));
			thead.appendChild(tr);
			table.appendChild(thead);

			var tbody = document.createElement("tbody");

			do {
				var result = formula.accept(new EvaluateVisitor(terms, values));
				tr = document.createElement("tr");
				values.forEach(function (value) { tr.appendChild(createElement("td", value ? "𝕋" : "𝔽")); });
				tr.appendChild(createElement("td", result ? "𝕋" : "𝔽"));
				tbody.appendChild(tr);
			} while (nextBinary(values));

			table.appendChild(tbody);

			truthTableElement.innerHTML = "";
			truthTableElement.appendChild(table);
			truthTableResultElement.style.removeProperty("display");
		}

		resultElement.style.removeProperty("display");
	}

	function mathify(string) {
		return string
			.replace(/&/g, "∧")
			.replace(/\|/g, "∨")
			.replace(/[!~]/g, "¬")
			.replace(/<->/g, "↔")
			.replace(/->/g, "→")
			.replace(/<-([^>])/g, "←$1")
			.replace(/\\A/gi, "∀")
			.replace(/\\E/gi, "∃");
	}

	function nextBinary(booleanArray) {
		var length = booleanArray.length;

		for (var i = length - 1; i >= 0; --i) {
			if (!booleanArray[i]) {
				booleanArray[i] = true;
				for (var j = i + 1; j < length; ++j) booleanArray[j] = false;
				return true;
			}
		}

		return false;
	}

	function HTMLTreeGeneratorVisitor(height) {
		var self = this;

		self.visitSymbol = function (symbol) {
			if (height > 1) {
				return createElement("i", symbol.identifier);
			} else {
				var box = createBox(1);
				box.innerText = symbol.identifier;
				box.style.fontStyle = "italic";
				return box;
			}
		};

		self.visitUnaryFormula = function (formula) {
			var operand = formula.operand;
			var height = formula.height;

			var box = createBox(height);
			box.appendChild(createText(height, formula.operator));

			if (operand.priority >= formula.priority) {
				box.appendChild(operand.accept(self));
			} else {
				box.appendChild(document.createTextNode("("));
				box.appendChild(operand.accept(self));
				box.appendChild(document.createTextNode(")"));
			}

			return box;
		};

		self.visitBinaryFormula = function (formula) {
			var left = formula.left;
			var operator = formula.operator;
			var right = formula.right;
			var priority = formula.priority;
			var height = formula.height;

			var box = createBox(formula.height);

			if ((left.operator === operator && left.isAssociative) || left.priority > priority) {
				box.appendChild(left.accept(self));
			} else {
				box.appendChild(document.createTextNode("("));
				box.appendChild(left.accept(self));
				box.appendChild(document.createTextNode(")"));
			}

			box.appendChild(document.createTextNode(" "));
			box.appendChild(createText(height, formula.operator));
			box.appendChild(document.createTextNode(" "));

			if (right.priority > priority) {
				box.appendChild(right.accept(self));
			} else {
				box.appendChild(document.createTextNode("("));
				box.appendChild(right.accept(self));
				box.appendChild(document.createTextNode(")"));
			}

			return box;
		};

		self.visitQuantifiedFormula = function (formula) {
			var height = formula.height;

			var box = createBox(height);
			box.appendChild(createText(height, formula.quantifier));
			box.appendChild(createText(height, formula.variable, true));

			if (formula.formula.priority >= formula.priority) {
				box.appendChild(document.createTextNode(" "));
				box.appendChild(formula.formula.accept(self));
			} else {
				box.appendChild(document.createTextNode(" ("));
				box.appendChild(formula.formula.accept(self));
				box.appendChild(document.createTextNode(")"));
			}

			return box;
		};

		self.visitCall = function (call) {
			var args = call.args;
			var height = call.height;

			var box = createBox(height);
			box.appendChild(createText(height, call.identifier, true));
			box.appendChild(document.createTextNode("("));

			for (var i = 0, count = args.length; i < count; ++i) {
				if (i > 0) box.appendChild(document.createTextNode(", "));
				box.appendChild(args[i].accept(self));
			}

			box.appendChild(document.createTextNode(")"));
			return box;
		};

		function createText(h, text, italicize) {
			var span = createElement("span", text);
			span.style.color = "hsl(" + ((height > 1 ? 360 / (height - 1) * (h - 1) : 0) + 210) + ", 100%, 50%)";
			if (italicize) span.style.fontStyle = "italic";
			return span;
		}

		function createBox(h) {
			var box = document.createElement("div");
			box.className = "first-order-logic-tool-box";
			box.style.borderColor = "hsl(" + ((height > 1 ? 360 / (height - 1) * (h - 1) : 0) + 210) + ", 100%, 50%)";
			return box;
		}
	}

	function HTMLTextGeneratorVisitor() {
		var self = this;

		self.visitSymbol = function (symbol) {
			return createElement("i", symbol.identifier);
		};

		self.visitUnaryFormula = function (formula) {
			var operand = formula.operand;

			var span = document.createElement("span");
			span.appendChild(document.createTextNode(formula.operator));

			if (operand.priority >= formula.priority) {
				span.appendChild(operand.accept(self));
			} else {
				span.appendChild(document.createTextNode("("));
				span.appendChild(operand.accept(self));
				span.appendChild(document.createTextNode(")"));
			}

			return span;
		};

		self.visitBinaryFormula = function (formula) {
			var left = formula.left;
			var operator = formula.operator;
			var right = formula.right;
			var priority = formula.priority;

			var span = document.createElement("span");

			if ((left.operator === operator && left.isAssociative) || left.priority > priority) {
				span.appendChild(left.accept(self));
			} else {
				span.appendChild(document.createTextNode("("));
				span.appendChild(left.accept(self));
				span.appendChild(document.createTextNode(")"));
			}

			span.appendChild(document.createTextNode(" " + operator + " "));

			if (right.priority > priority) {
				span.appendChild(right.accept(self));
			} else {
				span.appendChild(document.createTextNode("("));
				span.appendChild(right.accept(self));
				span.appendChild(document.createTextNode(")"));
			}

			return span;
		};

		self.visitQuantifiedFormula = function (formula) {
			var span = document.createElement("span");
			span.appendChild(document.createTextNode(formula.quantifier));
			span.appendChild(createElement("i", formula.variable));

			if (formula.formula.priority >= formula.priority) {
				span.appendChild(document.createTextNode(" "));
				span.appendChild(formula.formula.accept(self));
			} else {
				span.appendChild(document.createTextNode(" ("));
				span.appendChild(formula.formula.accept(self));
				span.appendChild(document.createTextNode(")"));
			}

			return span;
		};

		self.visitCall = function (call) {
			var args = call.args;

			var span = document.createElement("span");
			span.appendChild(createElement("i", call.identifier));
			span.appendChild(document.createTextNode("("));

			for (var i = 0, count = args.length; i < count; ++i) {
				if (i > 0) span.appendChild(document.createTextNode(", "));
				span.appendChild(args[i].accept(self));
			}

			span.appendChild(document.createTextNode(")"));
			return span;
		};
	}

	function CollectTermsVisitor() {
		var self = this;
		var terms = [];

		self.visitSymbol = function (symbol) {
			if (terms.indexOf(symbol.identifier) < 0) terms.push(symbol.identifier);
			return terms;
		};

		self.visitUnaryFormula = function (formula) {
			formula.operand.accept(self);
			return terms;
		};

		self.visitBinaryFormula = function (formula) {
			formula.left.accept(self);
			formula.right.accept(self);
			return terms;
		};
	}

	function EvaluateVisitor(terms, values) {
		var self = this;

		self.visitSymbol = function (symbol) {
			return values[terms.indexOf(symbol.identifier)];
		};

		self.visitUnaryFormula = function (formula) {
			return !formula.operand.accept(self);
		};

		self.visitBinaryFormula = function (formula) {
			switch (formula.operator) {
				case "∧":
					return formula.left.accept(self) && formula.right.accept(self);
				case "∨":
					return formula.left.accept(self) || formula.right.accept(self);
				case "→":
					return !formula.left.accept(self) || formula.right.accept(self);
				case "←":
					return formula.left.accept(self) || !formula.right.accept(self);
				case "↔":
					return formula.left.accept(self) === formula.right.accept(self);
			}
		};
	}
})();